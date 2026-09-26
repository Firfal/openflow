import path from "node:path";
import {
  AGENT_AUTHOR,
  AgentError,
  COLLECTIONS,
  FUNCTION_NAMES,
  handleMcpMessage,
  OWNER_CLAIM,
  PUBLICATION_FAILED_LOG,
  type ReleaseDoc,
  type SiteSchema,
  SnapshotError,
} from "@openflow/core";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { type CallableRequest, HttpsError, onCall, onRequest } from "firebase-functions/https";
import { defineString } from "firebase-functions/params";
import { onMessagePublished } from "firebase-functions/pubsub";
import {
  adminBackend,
  agentConfig,
  createAgentToken,
  loadSiteSchema,
  tokenFromRequest,
  verifyAgentToken,
} from "./agent.js";
import {
  type Builder,
  type CloudBuildEvent,
  currentHostingVersion,
  getSource,
  isOwnerToken,
  markLive,
  ownerDecision,
  parseOwners,
  releaseHostingVersion,
  releaseStatusFromBuild,
  runningRelease,
  snapshotFromFirestore,
  snapshotPath,
  startCloudBuild,
  startLocalBuild,
  type TokenInfo,
} from "./core.js";
import {
  decideRequest,
  describeRequest,
  errorPage,
  exchangeToken,
  OAUTH_SCOPE,
  OAuthError,
  registerClient,
  resourceMetadata,
  revokeToken,
  routeOf,
  serverMetadata,
  splitFunctionPath,
  startAuthorization,
  tokenRequestParams,
} from "./oauth.js";

if (getApps().length === 0) {
  initializeApp();
  // Optional fields (sourcePath, logUrl…) may be undefined: never fail a publication for that.
  getFirestore().settings({ ignoreUndefinedProperties: true });
}

/** E-mail(s) of the site owner, e.g. `client@exemple.fr` (comma-separated for several). */
export const ownerEmail = defineString("OPENFLOW_OWNER_EMAIL", {
  description: "E-mail du propriétaire du site (plusieurs adresses séparées par des virgules)",
});

const region = process.env.OPENFLOW_REGION || "europe-west1";
const emulator = process.env.FUNCTIONS_EMULATOR === "true";
const enforceAppCheck = process.env.OPENFLOW_ENFORCE_APP_CHECK === "true";

function projectId(): string {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId ?? "";
  } catch {
    return "";
  }
}

function builder(): Builder {
  const configured = process.env.OPENFLOW_BUILDER;
  if (configured === "local" || configured === "cloud-build") return configured;
  return emulator ? "local" : "cloud-build";
}

function hostingSite(): string {
  return process.env.OPENFLOW_HOSTING_SITE || projectId();
}

function assertOwner(request: CallableRequest): TokenInfo {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connectez-vous pour continuer.");
  const token = request.auth.token as TokenInfo;
  if (!isOwnerToken(token, parseOwners(ownerEmail.value()))) {
    throw new HttpsError("permission-denied", "Seul le propriétaire du site peut faire cela.");
  }
  return token;
}

/**
 * Grants the `of_owner` claim to the signed-in user when their verified email matches
 * `OPENFLOW_OWNER_EMAIL`. The admin calls it right after sign-in.
 */
export const openflowClaimOwner = onCall({ region, enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connectez-vous pour continuer.");
  const decision = ownerDecision(
    request.auth.token as TokenInfo,
    parseOwners(ownerEmail.value()),
    emulator,
  );
  if (!decision.ok) throw new HttpsError(decision.code, decision.message);
  const auth = getAuth();
  const user = await auth.getUser(request.auth.uid);
  if (user.customClaims?.[OWNER_CLAIM] !== true) {
    await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), [OWNER_CLAIM]: true });
    logger.info("OpenFlow owner claim granted", { uid: user.uid, email: user.email });
  }
  return { owner: true };
});

class PublishError extends Error {
  constructor(
    readonly code: "failed-precondition" | "internal",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Freezes the drafts into a snapshot (Cloud Storage), records a release and starts the static
 * build (Cloud Build in production, local `next build` with the emulators). Shared by the
 * « Publier » button and the AI assistant (`publish` tool).
 */
async function publishSite(by: string): Promise<{ releaseId: string }> {
  const db = getFirestore();
  const running = await runningRelease(db);
  if (running)
    throw new PublishError(
      "failed-precondition",
      "Une publication est déjà en cours : patientez quelques minutes.",
    );

  const kind = builder();
  const source = kind === "cloud-build" ? await getSource(db) : undefined;
  if (kind === "cloud-build" && !source) {
    throw new PublishError(
      "failed-precondition",
      "Le code du site n'a pas encore été envoyé : l'agence doit lancer `openflow deploy`.",
    );
  }

  const releaseRef = db.collection(COLLECTIONS.releases).doc();
  let snapshot: Awaited<ReturnType<typeof snapshotFromFirestore>>;
  try {
    snapshot = await snapshotFromFirestore(db, releaseRef.id);
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw new PublishError(
        "failed-precondition",
        `${error.message} : ${error.details.join(" ; ")}`,
      );
    }
    throw error;
  }

  const bucket = getStorage().bucket();
  const file = snapshotPath(releaseRef.id);
  await bucket
    .file(file)
    .save(JSON.stringify(snapshot), { contentType: "application/json", resumable: false });

  const release: ReleaseDoc = {
    status: "queued",
    createdAt: new Date().toISOString(),
    createdBy: by,
    snapshotPath: file,
    sourcePath: source?.path,
    builder: kind,
    pageCount: snapshot.pages.length,
  };
  await releaseRef.set(release);

  try {
    const started =
      kind === "cloud-build"
        ? await startCloudBuild({
            projectId: projectId(),
            bucket: bucket.name,
            sourcePath: source!.path,
            snapshotPath: file,
            releaseId: releaseRef.id,
            hostingTarget: process.env.OPENFLOW_HOSTING_TARGET || undefined,
            serviceAccount: process.env.OPENFLOW_BUILD_SERVICE_ACCOUNT || undefined,
          })
        : await startLocalBuild(
            process.env.OPENFLOW_LOCAL_SITE_DIR || path.resolve(process.cwd(), ".."),
            snapshot,
            releaseRef.id,
          );
    await releaseRef.update({ status: "building", ...started });
  } catch (error) {
    logger.error(PUBLICATION_FAILED_LOG, {
      releaseId: releaseRef.id,
      reason: `Le build n'a pas pu démarrer : ${(error as Error).message}`,
    });
    await releaseRef.update({
      status: "failed",
      error: (error as Error).message,
      finishedAt: new Date().toISOString(),
    });
    throw new PublishError(
      "internal",
      `Le build n'a pas pu démarrer : ${(error as Error).message}`,
    );
  }
  return { releaseId: releaseRef.id };
}

/** "Publier" (admin): see {@link publishSite}. */
export const openflowPublish = onCall(
  { region, enforceAppCheck, timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    const token = assertOwner(request);
    try {
      return await publishSite(String(token.email ?? request.auth?.uid ?? "inconnu"));
    } catch (error) {
      if (error instanceof PublishError) throw new HttpsError(error.code, error.message);
      throw error;
    }
  },
);

/**
 * Creates an access key for an AI assistant (MCP). The key is returned once; only its SHA-256
 * is stored. The owner revokes it from the admin (Réglages > Assistant IA).
 */
export const openflowCreateAgentToken = onCall({ region, enforceAppCheck }, async (request) => {
  const token = assertOwner(request);
  const label = String((request.data as { label?: unknown })?.label ?? "");
  const created = await createAgentToken(getFirestore(), {
    label,
    by: String(token.email ?? request.auth?.uid ?? "inconnu"),
  });
  logger.info("OpenFlow assistant key created", { id: created.id, by: token.email });
  return created;
});

/**
 * The owner's answer on the consent screen of the admin (`/admin/?view=connect&request=…`), when an
 * AI assistant asks to connect with OAuth: `{ requestId }` describes the request,
 * `{ requestId, decision: "approve" | "deny" }` answers it and returns where to send the browser.
 */
export const openflowAgentConsent = onCall({ region, enforceAppCheck }, async (request) => {
  const token = assertOwner(request);
  const data = (request.data ?? {}) as { requestId?: unknown; decision?: unknown };
  const db = getFirestore();
  try {
    if (data.decision === undefined) return await describeRequest(db, data.requestId);
    if (data.decision !== "approve" && data.decision !== "deny") {
      throw new HttpsError("invalid-argument", "decision : approve ou deny.");
    }
    const by = String(token.email ?? request.auth?.uid ?? "inconnu");
    const result = await decideRequest(db, {
      requestId: data.requestId,
      approve: data.decision === "approve",
      by,
    });
    logger.info("OpenFlow assistant consent", { decision: data.decision, by });
    return result;
  } catch (error) {
    if (error instanceof OAuthError) throw new HttpsError("failed-precondition", error.message);
    throw error;
  }
});

function storageBaseUrl(): string {
  const emulated = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (emulated) return emulated.startsWith("http") ? emulated : `http://${emulated}`;
  return "https://firebasestorage.googleapis.com";
}

/** Public origin of the site: `site.url` of the config, or the Hosting default domain. */
function siteOrigin(schema: SiteSchema | undefined): string {
  try {
    if (schema?.site.url) return new URL(schema.site.url).origin;
  } catch {
    // Invalid URL in the config: fall back to the Hosting domain.
  }
  return `https://${hostingSite()}.web.app`;
}

/** Hosts the MCP server answers for, besides the site's and Firebase's (custom domains). */
const extraHosts = (process.env.OPENFLOW_MCP_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

/**
 * Addresses as seen by the client. `base` is where this function's routes are (the site's origin
 * behind Hosting, the Cloud Run origin, or the function path of `cloudfunctions.net` and of the
 * emulator); `issuer` is the authorization server announced to clients (the site's origin for the
 * legacy `cloudfunctions.net` address, whose root is not ours). Hosts come from a fixed list, never
 * blindly from the request.
 */
function requestUrls(
  req: { headers: Record<string, unknown>; originalUrl?: string; url?: string },
  schema: SiteSchema | undefined,
): { base: string; issuer: string; path: string } {
  const site = hostingSite();
  let siteHost = "";
  try {
    siteHost = schema?.site.url ? new URL(schema.site.url).host.toLowerCase() : "";
  } catch {
    siteHost = "";
  }
  const allowed = (host: string) =>
    Boolean(host) &&
    (emulator ||
      host === `${site}.web.app` ||
      host === `${site}.firebaseapp.com` ||
      host === siteHost ||
      extraHosts.includes(host) ||
      host.endsWith(".run.app") ||
      host.endsWith(".cloudfunctions.net"));
  const first = (name: string) =>
    String(req.headers[name] ?? "")
      .split(",")[0]!
      .trim()
      .toLowerCase();
  const host = [first("x-fh-requested-host"), first("x-forwarded-host"), first("host")].find(
    allowed,
  );
  const pathname = new URL(req.originalUrl || req.url || "/", "http://localhost").pathname;
  let { prefix, path } = splitFunctionPath(pathname, FUNCTION_NAMES.mcp);
  // The emulator may pass the path without its `/<project>/<region>/<function>` prefix.
  if (emulator && !prefix) prefix = `/${projectId()}/${region}/${FUNCTION_NAMES.mcp}`;
  if (!host) {
    const origin = siteOrigin(schema);
    return { base: origin, issuer: origin, path };
  }
  const proto = emulator ? first("x-forwarded-proto") || "http" : "https";
  const base = `${proto}://${host}${prefix}`;
  return { base, issuer: prefix && !emulator ? siteOrigin(schema) : base, path };
}

function adminUrl(schema: SiteSchema | undefined): string {
  return process.env.OPENFLOW_ADMIN_URL || new URL("/admin/", siteOrigin(schema)).toString();
}

const jsonRpcError = (code: number, message: string) => ({
  jsonrpc: "2.0",
  id: null,
  error: { code, message },
});

/**
 * MCP server of the site (Model Context Protocol, Streamable HTTP, stateless): an AI assistant
 * (Claude, ChatGPT…) edits the site by chat with the tools of `@openflow/core` (`AGENT_TOOLS`).
 *
 * Address: `https://<site>/mcp` (Hosting rewrite, see `firebase.json`), also reachable at the
 * function's own addresses. Assistants connect with OAuth (`oauth.ts`: metadata, registration,
 * consent in the admin, tokens), or with an owner-created key (`Authorization: Bearer ofk_…`, or
 * `?key=ofk_…` for clients without custom headers).
 */
export const openflowMcp = onRequest(
  {
    region,
    timeoutSeconds: 120,
    memory: "512MiB",
    cors: false,
    invoker: "public",
    maxInstances: 10,
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
    );
    res.set("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    res.set("Access-Control-Expose-Headers", "WWW-Authenticate");
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    const db = getFirestore();
    const schema = await loadSiteSchema(db);
    const urls = requestUrls(req as never, schema);
    const { route, suffix } = routeOf(urls.path);
    const only = (method: string) => {
      if (req.method === method) return true;
      res
        .set("Allow", `${method}, OPTIONS`)
        .status(405)
        .json({
          error: "invalid_request",
          error_description: `Méthode non prise en charge : utilisez ${method}.`,
        });
      return false;
    };
    try {
      switch (route) {
        case "resource-metadata":
          if (!only("GET")) return;
          res
            .set("Cache-Control", "public, max-age=300")
            .json(
              resourceMetadata(urls.base + suffix, urls.issuer, schema?.site.name ?? hostingSite()),
            );
          return;
        case "server-metadata":
          if (!only("GET")) return;
          res.set("Cache-Control", "public, max-age=300").json(serverMetadata(urls.base));
          return;
        case "register":
          if (!only("POST")) return;
          res.status(201).json(await registerClient(db, req.body));
          return;
        case "authorize": {
          if (!only("GET")) return;
          const result = await startAuthorization(db, req.query as Record<string, unknown>, {
            adminUrl: adminUrl(schema),
            issuer: urls.base,
          });
          if ("redirect" in result) {
            res.redirect(302, result.redirect);
          } else {
            res
              .status(400)
              .set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
              .type("html")
              .send(errorPage(result.page));
          }
          return;
        }
        case "token":
          if (!only("POST")) return;
          res
            .set("Pragma", "no-cache")
            .json(await exchangeToken(db, tokenRequestParams(req.body, req.headers.authorization)));
          return;
        case "revoke":
          if (!only("POST")) return;
          await revokeToken(db, tokenRequestParams(req.body, req.headers.authorization));
          res.status(200).json({});
          return;
        case "unknown":
          res.status(404).json(jsonRpcError(-32000, "Adresse inconnue : utilisez /mcp."));
          return;
        default:
          break;
      }
    } catch (error) {
      if (error instanceof OAuthError) {
        res.status(error.status).json({ error: error.code, error_description: error.message });
      } else {
        logger.error("OpenFlow OAuth", error);
        res.status(500).json({ error: "server_error", error_description: "Erreur interne." });
      }
      return;
    }

    // MCP itself.
    if (req.method !== "POST") {
      // Stateless server: no event stream to open, no session to delete.
      res
        .set("Allow", "POST, OPTIONS")
        .status(405)
        .json(jsonRpcError(-32000, "Method not allowed: use POST."));
      return;
    }
    const key = await verifyAgentToken(
      db,
      tokenFromRequest(
        req.headers as Record<string, unknown>,
        req.query as Record<string, unknown>,
      ),
    );
    if (!key) {
      res
        .set(
          "WWW-Authenticate",
          `Bearer resource_metadata="${urls.base}/.well-known/oauth-protected-resource${suffix}", scope="${OAUTH_SCOPE}"`,
        )
        .status(401)
        .json(
          jsonRpcError(
            -32001,
            "Connexion requise : ajoutez ce serveur dans votre assistant IA et connectez-vous, ou utilisez une clé créée dans l'admin (Assistant IA).",
          ),
        );
      return;
    }
    if (!schema) {
      res
        .status(503)
        .json(jsonRpcError(-32002, "Schéma du site absent : lancez `openflow deploy`."));
      return;
    }
    const bucket = getStorage().bucket();
    const context = {
      schema,
      config: agentConfig(schema),
      backend: adminBackend({
        db,
        bucket,
        storageBaseUrl: storageBaseUrl(),
        publish: async () => {
          try {
            return await publishSite(`${AGENT_AUTHOR} (${key.doc.label})`);
          } catch (error) {
            if (error instanceof PublishError) throw new AgentError(error.message);
            throw error;
          }
        },
      }),
    };
    const settings = await context.backend.getSettings();
    const response = await handleMcpMessage(req.body, {
      context,
      siteName: settings.site.name || schema.site.name,
      onToolCall: (name, ok) => logger.info("OpenFlow MCP tool", { name, ok, key: key.id }),
    });
    if (!response) {
      res.status(202).end();
      return;
    }
    res.status(200).json(response);
  },
);

/** Follows Cloud Build (topic `cloud-builds`) and updates the matching release. */
export const openflowOnBuildStatus = onMessagePublished(
  { topic: "cloud-builds", region },
  async (event) => {
    const build = event.data.message.json as CloudBuildEvent;
    const releaseId = build.substitutions?._OPENFLOW_RELEASE_ID;
    if (!releaseId) return;
    const status = releaseStatusFromBuild(build);
    if (!status) return;
    const db = getFirestore();
    const ref = db.collection(COLLECTIONS.releases).doc(releaseId);
    const current = (await ref.get()).data() as ReleaseDoc | undefined;
    if (
      !current ||
      current.status === "live" ||
      current.status === "failed" ||
      current.status === "superseded"
    )
      return;
    const finishedAt = build.finishTime ?? new Date().toISOString();
    if (status === "live") {
      let hostingVersion: string | undefined;
      try {
        hostingVersion = await currentHostingVersion(hostingSite());
      } catch (error) {
        logger.warn("Could not read the Hosting release", error);
      }
      await markLive(db, releaseId, {
        finishedAt,
        hostingVersion,
        logUrl: build.logUrl ?? current.logUrl,
      });
    } else if (status === "failed") {
      logger.error(PUBLICATION_FAILED_LOG, {
        releaseId,
        reason: build.failureInfo?.detail || build.statusDetail || `Build ${build.status}`,
        logUrl: build.logUrl,
      });
      await ref.update({
        status,
        finishedAt,
        logUrl: build.logUrl ?? current.logUrl,
        error: build.failureInfo?.detail || build.statusDetail || `Build ${build.status}`,
      });
    } else if (status !== current.status) {
      await ref.update({ status });
    }
  },
);

/** "Remettre en ligne": re-releases the Hosting version of a previous publication, instantly. */
export const openflowRestoreRelease = onCall({ region, enforceAppCheck }, async (request) => {
  assertOwner(request);
  const releaseId = (request.data as { releaseId?: unknown })?.releaseId;
  if (typeof releaseId !== "string" || !releaseId)
    throw new HttpsError("invalid-argument", "releaseId manquant.");
  const db = getFirestore();
  const release = (await db.collection(COLLECTIONS.releases).doc(releaseId).get()).data() as
    | ReleaseDoc
    | undefined;
  if (!release) throw new HttpsError("not-found", "Publication introuvable.");
  if (!release.hostingVersion)
    throw new HttpsError(
      "failed-precondition",
      "Cette publication ne peut pas être remise en ligne.",
    );
  if (release.builder === "cloud-build") {
    await releaseHostingVersion(
      hostingSite(),
      release.hostingVersion,
      `OpenFlow : restauration de ${releaseId}`,
    );
  }
  await markLive(db, releaseId, { restoredAt: new Date().toISOString() });
  return { ok: true };
});
