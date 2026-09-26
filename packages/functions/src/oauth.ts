import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type AgentTokenDoc, COLLECTIONS } from "@openflow/core";
import type { Firestore } from "firebase-admin/firestore";
import { hashAgentToken, OAUTH_ACCESS_TOKEN_PREFIX } from "./agent.js";

/**
 * OAuth 2.1 authorization server of the site's MCP server, as the MCP authorization specification
 * asks (2025-06-18 and 2025-11-25): protected resource metadata (RFC 9728), authorization server
 * metadata (RFC 8414), dynamic client registration (RFC 7591), authorization code with PKCE S256,
 * refresh tokens with rotation, revocation (RFC 7009).
 *
 * An assistant (Claude, ChatGPT…) only needs the address `https://<site>/mcp`: it registers, sends
 * the owner to the consent screen of the admin (`/admin/?view=connect`), then gets its tokens.
 * Every secret (code, access and refresh tokens, client secret) is stored as a SHA-256 hash.
 */

export const OAUTH_SCOPE = "site";
export const ACCESS_TOKEN_PREFIX = OAUTH_ACCESS_TOKEN_PREFIX;
export const REFRESH_TOKEN_PREFIX = "ofr_";
const CODE_PREFIX = "ofcode_";
const CLIENT_PREFIX = "ofcli_";
const SECRET_PREFIX = "ofs_";

export const ACCESS_TOKEN_TTL_S = 3600;
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 3600 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TTL_MS = 10 * 60 * 1000;
const IDLE_CLIENT_TTL_MS = 30 * 24 * 3600 * 1000;
export const MAX_REGISTRATION_BYTES = 8 * 1024;

type AuthMethod = "none" | "client_secret_post" | "client_secret_basic";
const AUTH_METHODS: AuthMethod[] = ["none", "client_secret_post", "client_secret_basic"];

/** `of_agent_clients/{clientId}` */
export interface AgentClientDoc {
  name: string;
  redirectUris: string[];
  authMethod: AuthMethod;
  secretHash?: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** `of_agent_requests/{id}`: an authorization request waiting for the owner. */
export interface AgentRequestDoc {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  resource?: string;
  issuer: string;
  createdAt: string;
  expiresAt: string;
}

/** `of_agent_codes/{hash}`: an authorization code given after consent. */
interface AgentCodeDoc {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  resource?: string;
  by: string;
  expiresAt: string;
}

/** An OAuth error, sent as `{ error, error_description }`. */
export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

const secret = (prefix: string, bytes = 32) =>
  `${prefix}${randomBytes(bytes).toString("base64url")}`;

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** PKCE S256: `BASE64URL(SHA256(verifier))`. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

const PKCE_VALUE = /^[A-Za-z0-9._~-]{43,128}$/;

export function verifyPkce(verifier: unknown, challenge: string): boolean {
  return (
    typeof verifier === "string" &&
    PKCE_VALUE.test(verifier) &&
    sameHash(pkceChallenge(verifier), challenge)
  );
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const FORBIDDEN_SCHEMES = new Set([
  "javascript",
  "data",
  "file",
  "vbscript",
  "blob",
  "about",
  "ftp",
  "ws",
  "wss",
  "mailto",
  "tel",
  "sms",
]);

/**
 * Checks a redirect URI given at registration: `https`, `http` on the loopback interface only
 * (native apps, RFC 8252), or an application's own scheme (`cursor://`, `vscode://`…). Returns why
 * it is refused, or `undefined`.
 */
export function redirectUriProblem(uri: unknown): string | undefined {
  if (typeof uri !== "string" || uri.length === 0 || uri.length > 2000) return "adresse invalide";
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return "adresse invalide";
  }
  if (url.hash) return "fragment (#) interdit";
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (scheme === "https") return url.hostname ? undefined : "adresse invalide";
  if (scheme === "http") {
    return LOOPBACK.has(url.hostname) ? undefined : "http est réservé à la boucle locale";
  }
  if (FORBIDDEN_SCHEMES.has(scheme)) return `schéma ${scheme}: interdit`;
  return /^[a-z][a-z0-9+.-]*$/.test(scheme) ? undefined : "schéma invalide";
}

/** The requested URI is a registered one (a loopback URI may use any port, RFC 8252 §7.3). */
export function redirectUriMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let asked: URL;
  try {
    asked = new URL(requested);
  } catch {
    return false;
  }
  if (asked.protocol !== "http:" || !LOOPBACK.has(asked.hostname)) return false;
  return registered.some((uri) => {
    try {
      const known = new URL(uri);
      return (
        known.protocol === "http:" &&
        known.hostname === asked.hostname &&
        known.pathname === asked.pathname &&
        known.search === asked.search
      );
    } catch {
      return false;
    }
  });
}

/** Where the owner is sent back, in words: « claude.ai », « l'application cursor »… */
export function describeRedirect(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.protocol === "https:") return url.hostname;
    if (url.protocol === "http:") return "une application de cet ordinateur";
    return `l'application ${url.protocol.slice(0, -1)}`;
  } catch {
    return uri;
  }
}

/** A web site, an application of this computer (loopback), or an application's own scheme. */
export function redirectKind(uri: string): "web" | "local" | "app" {
  try {
    const { protocol } = new URL(uri);
    return protocol === "https:" ? "web" : protocol === "http:" ? "local" : "app";
  } catch {
    return "app";
  }
}

/** Client metadata sent to the registration endpoint (RFC 7591), checked and normalized. */
export function parseClientMetadata(body: unknown): {
  name: string;
  redirectUris: string[];
  authMethod: AuthMethod;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new OAuthError("invalid_client_metadata", "Le corps doit être un objet JSON.");
  }
  if (JSON.stringify(body).length > MAX_REGISTRATION_BYTES) {
    throw new OAuthError("invalid_client_metadata", "Métadonnées trop volumineuses.");
  }
  const meta = body as Record<string, unknown>;
  const uris = meta.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris : de 1 à 10 adresses.");
  }
  for (const uri of uris) {
    const problem = redirectUriProblem(uri);
    if (problem) throw new OAuthError("invalid_redirect_uri", `${String(uri)} : ${problem}.`);
  }
  const method = meta.token_endpoint_auth_method ?? "none";
  if (!AUTH_METHODS.includes(method as AuthMethod)) {
    throw new OAuthError(
      "invalid_client_metadata",
      `token_endpoint_auth_method : ${AUTH_METHODS.join(", ")}.`,
    );
  }
  const grants = meta.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || !grants.includes("authorization_code"))) {
    throw new OAuthError(
      "invalid_client_metadata",
      "grant_types doit contenir authorization_code.",
    );
  }
  const name =
    typeof meta.client_name === "string"
      ? meta.client_name
          .replace(/[\p{C}]/gu, "")
          .trim()
          .slice(0, 80)
      : "";
  return {
    name: name || "Assistant IA",
    redirectUris: uris as string[],
    authMethod: method as AuthMethod,
  };
}

/** Parameters of a token or revocation request: form or JSON body, client credentials in Basic. */
export function tokenRequestParams(
  body: unknown,
  authorization: unknown,
): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};
  if (body && typeof body === "object" && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") params[key] = value;
    }
  } else if (typeof body === "string") {
    for (const [key, value] of new URLSearchParams(body)) params[key] = value;
  }
  const basic = /^Basic\s+(\S+)$/i.exec(String(authorization ?? ""))?.[1];
  if (basic) {
    const decoded = Buffer.from(basic, "base64").toString("utf8");
    const at = decoded.indexOf(":");
    if (at > 0) {
      params.client_id = decodeURIComponent(decoded.slice(0, at));
      params.client_secret = decodeURIComponent(decoded.slice(at + 1));
      params.__basic = "1";
    }
  }
  return params;
}

export function endpoints(issuer: string) {
  return {
    authorization_endpoint: `${issuer}/mcp/oauth/authorize`,
    token_endpoint: `${issuer}/mcp/oauth/token`,
    registration_endpoint: `${issuer}/mcp/oauth/register`,
    revocation_endpoint: `${issuer}/mcp/oauth/revoke`,
  };
}

/** Authorization server metadata (RFC 8414). */
export function serverMetadata(issuer: string) {
  return {
    issuer,
    ...endpoints(issuer),
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: AUTH_METHODS,
    revocation_endpoint_auth_methods_supported: AUTH_METHODS,
    scopes_supported: [OAUTH_SCOPE],
    authorization_response_iss_parameter_supported: true,
    service_documentation: "https://github.com/Firfal/openflow/blob/main/docs/assistant-ia.md",
  };
}

/** Protected resource metadata (RFC 9728) of `resource`, the address the client connected to. */
export function resourceMetadata(resource: string, issuer: string, siteName: string) {
  return {
    resource,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: [OAUTH_SCOPE],
    resource_name: `OpenFlow · ${siteName}`,
    resource_documentation: "https://github.com/Firfal/openflow/blob/main/docs/assistant-ia.md",
  };
}

/** Route of a request path, once the function's own prefix is removed. */
export type OAuthRoute =
  | "mcp"
  | "resource-metadata"
  | "server-metadata"
  | "register"
  | "authorize"
  | "token"
  | "revoke"
  | "unknown";

export function routeOf(path: string): { route: OAuthRoute; suffix: string } {
  const clean = path.replace(/\/+$/, "") || "/";
  const prm = "/.well-known/oauth-protected-resource";
  if (clean === prm || clean.startsWith(`${prm}/`)) {
    return { route: "resource-metadata", suffix: clean.slice(prm.length) };
  }
  const asm = "/.well-known/oauth-authorization-server";
  if (clean === asm || clean.startsWith(`${asm}/`)) return { route: "server-metadata", suffix: "" };
  if (clean === "/" || clean === "/mcp")
    return { route: "mcp", suffix: clean === "/" ? "" : "/mcp" };
  const oauth = /^(?:\/mcp)?\/oauth\/(register|authorize|token|revoke)$/.exec(clean)?.[1];
  if (oauth) return { route: oauth as OAuthRoute, suffix: "" };
  return { route: "unknown", suffix: "" };
}

/**
 * Splits a request path into the function's prefix and the route path: the emulator serves
 * `/<project>/<region>/openflowMcp/…`, `cloudfunctions.net` serves `/openflowMcp/…`, Hosting and
 * Cloud Run serve the path as is.
 */
export function splitFunctionPath(
  pathname: string,
  functionName: string,
): {
  prefix: string;
  path: string;
} {
  const at = pathname.indexOf(`/${functionName}`);
  if (at < 0) return { prefix: "", path: pathname || "/" };
  const end = at + functionName.length + 1;
  if (pathname.length > end && pathname[end] !== "/") return { prefix: "", path: pathname };
  return { prefix: pathname.slice(0, end), path: pathname.slice(end) || "/" };
}

/** Minimal HTML page for errors a client cannot receive (bad client or redirect URI). */
export function errorPage(message: string): string {
  const escaped = message.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connexion impossible</title><body style="font:15px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#18181b"><h1 style="font-size:20px">Connexion impossible</h1><p>${escaped}</p><p>Relancez la connexion depuis votre assistant IA.</p></body></html>`;
}

// ─── Firestore ───────────────────────────────────────────────────────────────

const now = () => new Date();
const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();

/** Removes expired requests and codes, and clients unused for 30 days (bounded, best effort). */
export async function purgeExpired(db: Firestore): Promise<void> {
  const stamp = now().toISOString();
  const stale = new Date(Date.now() - IDLE_CLIENT_TTL_MS).toISOString();
  const queries = [
    db.collection(COLLECTIONS.agentRequests).where("expiresAt", "<", stamp).limit(20),
    db.collection(COLLECTIONS.agentCodes).where("expiresAt", "<", stamp).limit(20),
    db.collection(COLLECTIONS.agentClients).where("createdAt", "<", stale).limit(20),
  ];
  const [requests, codes, clients] = await Promise.all(queries.map((q) => q.get()));
  const batch = db.batch();
  for (const doc of [...requests!.docs, ...codes!.docs]) batch.delete(doc.ref);
  for (const doc of clients!.docs) {
    if (!(doc.data() as AgentClientDoc).lastUsedAt) batch.delete(doc.ref);
  }
  await batch.commit();
}

/** Dynamic client registration (RFC 7591). */
export async function registerClient(db: Firestore, body: unknown) {
  const meta = parseClientMetadata(body);
  const clientId = secret(CLIENT_PREFIX, 16);
  const clientSecret = meta.authMethod === "none" ? undefined : secret(SECRET_PREFIX);
  const doc: AgentClientDoc = {
    name: meta.name,
    redirectUris: meta.redirectUris,
    authMethod: meta.authMethod,
    ...(clientSecret ? { secretHash: hashAgentToken(clientSecret) } : {}),
    createdAt: now().toISOString(),
  };
  await db.collection(COLLECTIONS.agentClients).doc(clientId).set(doc);
  await purgeExpired(db).catch(() => undefined);
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: meta.name,
    redirect_uris: meta.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: meta.authMethod,
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
  };
}

async function getClient(db: Firestore, clientId: unknown): Promise<AgentClientDoc | undefined> {
  if (
    typeof clientId !== "string" ||
    !clientId.startsWith(CLIENT_PREFIX) ||
    clientId.length > 100
  ) {
    return undefined;
  }
  return (await db.collection(COLLECTIONS.agentClients).doc(clientId).get()).data() as
    | AgentClientDoc
    | undefined;
}

/**
 * Authorization endpoint. Returns where to send the browser: the consent screen of the admin, or
 * back to the client with an error. A bad client or redirect URI is never redirected to (`page`).
 */
export async function startAuthorization(
  db: Firestore,
  query: Record<string, unknown>,
  options: { adminUrl: string; issuer: string },
): Promise<{ redirect: string } | { page: string }> {
  const client = await getClient(db, query.client_id);
  if (!client) return { page: "Assistant inconnu : son enregistrement a expiré ou est invalide." };
  const redirectUri = typeof query.redirect_uri === "string" ? query.redirect_uri : "";
  if (!redirectUri && client.redirectUris.length !== 1) {
    return { page: "Adresse de retour manquante." };
  }
  const target = redirectUri || client.redirectUris[0]!;
  if (!redirectUriMatches(client.redirectUris, target)) {
    return { page: "Adresse de retour non enregistrée pour cet assistant." };
  }
  const state = typeof query.state === "string" ? query.state.slice(0, 1000) : undefined;
  const fail = (error: string, description: string) => {
    const url = new URL(target);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    url.searchParams.set("iss", options.issuer);
    return { redirect: url.toString() };
  };
  if (query.response_type !== "code") {
    return fail("unsupported_response_type", "Seul response_type=code est pris en charge.");
  }
  const challenge = query.code_challenge;
  if (typeof challenge !== "string" || !PKCE_VALUE.test(challenge)) {
    return fail("invalid_request", "PKCE requis : code_challenge manquant ou invalide.");
  }
  if (query.code_challenge_method !== "S256") {
    return fail("invalid_request", "PKCE : code_challenge_method=S256 requis.");
  }
  const resource = typeof query.resource === "string" ? query.resource.slice(0, 500) : undefined;
  const id = secret("", 24);
  const doc: AgentRequestDoc = {
    clientId: String(query.client_id),
    clientName: client.name,
    redirectUri: target,
    codeChallenge: challenge,
    ...(state ? { state } : {}),
    ...(resource ? { resource } : {}),
    issuer: options.issuer,
    createdAt: now().toISOString(),
    expiresAt: inMs(REQUEST_TTL_MS),
  };
  await db.collection(COLLECTIONS.agentRequests).doc(id).set(doc);
  const admin = new URL(options.adminUrl);
  admin.searchParams.set("view", "connect");
  admin.searchParams.set("request", id);
  return { redirect: admin.toString() };
}

/** What the consent screen shows about a pending request. */
export async function describeRequest(db: Firestore, requestId: unknown) {
  const request = await pendingRequest(db, requestId);
  return {
    clientName: request.clientName,
    redirect: describeRedirect(request.redirectUri),
    redirectKind: redirectKind(request.redirectUri),
    redirectHost: (() => {
      try {
        return new URL(request.redirectUri).host;
      } catch {
        return "";
      }
    })(),
    expiresAt: request.expiresAt,
  };
}

async function pendingRequest(db: Firestore, requestId: unknown): Promise<AgentRequestDoc> {
  if (typeof requestId !== "string" || !/^[\w-]{20,64}$/.test(requestId)) {
    throw new OAuthError("invalid_request", "Demande de connexion invalide.");
  }
  const doc = (await db.collection(COLLECTIONS.agentRequests).doc(requestId).get()).data() as
    | AgentRequestDoc
    | undefined;
  if (!doc || Date.parse(doc.expiresAt) < Date.now()) {
    throw new OAuthError(
      "expired",
      "Cette demande de connexion a expiré : relancez la connexion depuis votre assistant.",
    );
  }
  return doc;
}

/** The owner's answer: a single-use code for the client, or a refusal. */
export async function decideRequest(
  db: Firestore,
  input: { requestId: unknown; approve: boolean; by: string },
): Promise<{ redirectUrl: string }> {
  const ref = db.collection(COLLECTIONS.agentRequests).doc(String(input.requestId));
  const request = await pendingRequest(db, input.requestId);
  const url = new URL(request.redirectUri);
  if (request.state) url.searchParams.set("state", request.state);
  url.searchParams.set("iss", request.issuer);
  if (!input.approve) {
    await ref.delete();
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "Le propriétaire du site a refusé l'accès.");
    return { redirectUrl: url.toString() };
  }
  const code = secret(CODE_PREFIX);
  const codeDoc: AgentCodeDoc = {
    clientId: request.clientId,
    clientName: request.clientName,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    ...(request.resource ? { resource: request.resource } : {}),
    by: input.by,
    expiresAt: inMs(CODE_TTL_MS),
  };
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) throw new OAuthError("expired", "Demande déjà traitée.");
    tx.delete(ref);
    tx.set(db.collection(COLLECTIONS.agentCodes).doc(hashAgentToken(code)), codeDoc);
  });
  url.searchParams.set("code", code);
  return { redirectUrl: url.toString() };
}

function authenticateClient(
  client: AgentClientDoc | undefined,
  params: Record<string, string | undefined>,
): void {
  if (!client) throw new OAuthError("invalid_client", "Assistant inconnu.", 401);
  if (client.authMethod === "none") return;
  const presented = params.client_secret;
  if (!presented || !client.secretHash || !sameHash(hashAgentToken(presented), client.secretHash)) {
    throw new OAuthError("invalid_client", "Secret du client invalide.", 401);
  }
}

function tokenResponse(access: string, refresh: string) {
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_S,
    refresh_token: refresh,
    scope: OAUTH_SCOPE,
  };
}

/** Token endpoint: `authorization_code` (with PKCE) and `refresh_token` (rotated each time). */
export async function exchangeToken(
  db: Firestore,
  params: Record<string, string | undefined>,
): Promise<ReturnType<typeof tokenResponse>> {
  const grant = params.grant_type;
  if (grant === "authorization_code") return exchangeCode(db, params);
  if (grant === "refresh_token") return refresh(db, params);
  throw new OAuthError(
    "unsupported_grant_type",
    "grant_type : authorization_code ou refresh_token.",
  );
}

async function exchangeCode(db: Firestore, params: Record<string, string | undefined>) {
  const code = params.code;
  if (!code?.startsWith(CODE_PREFIX) || code.length > 200) {
    throw new OAuthError("invalid_grant", "Code d'autorisation invalide.");
  }
  const codeRef = db.collection(COLLECTIONS.agentCodes).doc(hashAgentToken(code));
  const access = secret(ACCESS_TOKEN_PREFIX);
  const refreshToken = secret(REFRESH_TOKEN_PREFIX);
  // The code is deleted in every case (single use): errors are returned, then thrown after commit.
  const problem = await db.runTransaction(async (tx): Promise<OAuthError | undefined> => {
    const stored = (await tx.get(codeRef)).data() as AgentCodeDoc | undefined;
    if (!stored)
      return new OAuthError("invalid_grant", "Code d'autorisation invalide ou déjà utilisé.");
    const clientRef = db.collection(COLLECTIONS.agentClients).doc(stored.clientId);
    const client = (await tx.get(clientRef)).data() as AgentClientDoc | undefined;
    tx.delete(codeRef);
    if (Date.parse(stored.expiresAt) < Date.now()) {
      return new OAuthError("invalid_grant", "Code d'autorisation expiré.");
    }
    if (params.client_id && params.client_id !== stored.clientId) {
      return new OAuthError("invalid_grant", "Ce code a été délivré à un autre assistant.");
    }
    if (params.redirect_uri && params.redirect_uri !== stored.redirectUri) {
      return new OAuthError("invalid_grant", "redirect_uri différente de celle de l'autorisation.");
    }
    if (!verifyPkce(params.code_verifier, stored.codeChallenge)) {
      return new OAuthError("invalid_grant", "PKCE : code_verifier invalide.");
    }
    try {
      authenticateClient(client, params);
    } catch (error) {
      return error as OAuthError;
    }
    const at = now().toISOString();
    const doc: AgentTokenDoc = {
      kind: "oauth",
      label: stored.clientName,
      hash: hashAgentToken(access),
      prefix: access.slice(0, ACCESS_TOKEN_PREFIX.length + 6),
      createdAt: at,
      createdBy: stored.by,
      lastUsedAt: at,
      clientId: stored.clientId,
      expiresAt: inMs(ACCESS_TOKEN_TTL_S * 1000),
      refreshHash: hashAgentToken(refreshToken),
      refreshExpiresAt: inMs(REFRESH_TOKEN_TTL_MS),
      redirect: describeRedirect(stored.redirectUri),
    };
    tx.set(db.collection(COLLECTIONS.agentTokens).doc(), doc);
    tx.update(clientRef, { lastUsedAt: at });
    return undefined;
  });
  if (problem) throw problem;
  return tokenResponse(access, refreshToken);
}

async function refresh(db: Firestore, params: Record<string, string | undefined>) {
  const presented = params.refresh_token;
  if (!presented?.startsWith(REFRESH_TOKEN_PREFIX) || presented.length > 200) {
    throw new OAuthError("invalid_grant", "Jeton de rafraîchissement invalide.");
  }
  const snap = await db
    .collection(COLLECTIONS.agentTokens)
    .where("refreshHash", "==", hashAgentToken(presented))
    .limit(1)
    .get();
  const found = snap.docs[0];
  const stored = found?.data() as AgentTokenDoc | undefined;
  if (!found || !stored?.clientId) {
    throw new OAuthError("invalid_grant", "Jeton de rafraîchissement invalide ou révoqué.");
  }
  if (!stored.refreshExpiresAt || Date.parse(stored.refreshExpiresAt) < Date.now()) {
    await found.ref.delete().catch(() => undefined);
    throw new OAuthError("invalid_grant", "Connexion expirée : reconnectez l'assistant.");
  }
  if (params.client_id && params.client_id !== stored.clientId) {
    throw new OAuthError("invalid_grant", "Ce jeton a été délivré à un autre assistant.");
  }
  authenticateClient(await getClient(db, stored.clientId), params);
  const access = secret(ACCESS_TOKEN_PREFIX);
  const next = secret(REFRESH_TOKEN_PREFIX);
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(found.ref)).data() as AgentTokenDoc | undefined;
    if (!fresh || fresh.refreshHash !== stored.refreshHash) {
      throw new OAuthError("invalid_grant", "Jeton de rafraîchissement déjà utilisé.");
    }
    tx.update(found.ref, {
      hash: hashAgentToken(access),
      prefix: access.slice(0, ACCESS_TOKEN_PREFIX.length + 6),
      expiresAt: inMs(ACCESS_TOKEN_TTL_S * 1000),
      refreshHash: hashAgentToken(next),
      refreshExpiresAt: inMs(REFRESH_TOKEN_TTL_MS),
    });
  });
  return tokenResponse(access, next);
}

/** Revocation (RFC 7009): disconnects the assistant; unknown tokens are ignored. */
export async function revokeToken(
  db: Firestore,
  params: Record<string, string | undefined>,
): Promise<void> {
  const token = params.token;
  if (!token || token.length > 200) return;
  const field = token.startsWith(REFRESH_TOKEN_PREFIX)
    ? "refreshHash"
    : token.startsWith(ACCESS_TOKEN_PREFIX)
      ? "hash"
      : undefined;
  if (!field) return;
  const snap = await db
    .collection(COLLECTIONS.agentTokens)
    .where(field, "==", hashAgentToken(token))
    .limit(1)
    .get();
  const found = snap.docs[0];
  const stored = found?.data() as AgentTokenDoc | undefined;
  if (!found || !stored) return;
  if (params.client_id && stored.clientId && params.client_id !== stored.clientId) return;
  await found.ref.delete();
}
