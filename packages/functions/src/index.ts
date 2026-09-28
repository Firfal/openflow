import path from "node:path";
import {
  AGENT_AUTHOR,
  AgentError,
  COLLECTIONS,
  configFromSchema,
  DOCS,
  FUNCTION_NAMES,
  handleMcpMessage,
  type MessageDoc,
  OWNER_CLAIM,
  outdatedSince,
  PUBLICATION_FAILED_LOG,
  parseSnapshot,
  publicStorageUrl,
  publishedAt,
  publishedPaths,
  REFRESH_AUTHOR,
  type ReleaseDoc,
  type SearchStatsResult,
  type SettingsDoc,
  type SiteSchema,
  type Snapshot,
  SnapshotError,
  statsDay,
} from "@openflow/core";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { type CallableRequest, HttpsError, onCall, onRequest } from "firebase-functions/https";
import { defineString } from "firebase-functions/params";
import { onMessagePublished } from "firebase-functions/pubsub";
import { onSchedule } from "firebase-functions/scheduler";
import { onObjectFinalized } from "firebase-functions/storage";
import { GoogleAuth } from "google-auth-library";
import {
  adminBackend,
  agentConfig,
  createAgentToken,
  loadSiteSchema,
  tokenFromRequest,
  verifyAgentToken,
} from "./agent.js";
import { type BookingBody, bookingEmail, handleBooking, handleBusy } from "./booking.js";
import {
  type Builder,
  type CloudBuildEvent,
  currentHostingVersion,
  ensureIndexNowKey,
  getSource,
  isOwnerToken,
  markLive,
  notifyIndexNow,
  ownerDecision,
  pagesFromFirestore,
  parseOwners,
  recordSiteFacts,
  releaseHostingVersion,
  releaseStatusFromBuild,
  runningRelease,
  snapshotFromFirestore,
  snapshotPath,
  startCloudBuild,
  startLocalBuild,
  type TokenInfo,
} from "./core.js";
import { handleSubmission, MAX_BODY_BYTES, messageEmail, type SubmitBody } from "./forms.js";
import { isOriginalMedia, mediaEntry, optimizeImage, optimizeVideo } from "./media.js";
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
import { publishScheduled } from "./schedule.js";
import { searchStats } from "./search.js";
import { parseBeacon, recordPageView } from "./stats.js";

if (getApps().length === 0) {
  initializeApp();
  // Optional fields (sourcePath, logUrl…) may be undefined: never fail a publication for that.
  getFirestore().settings({ ignoreUndefinedProperties: true });
}

/** E-mail(s) of the site owner, e.g. `client@exemple.fr` (comma-separated for several). */
export const ownerEmail = defineString("CMS_OWNER_EMAIL", {
  description: "E-mail du propriétaire du site (plusieurs adresses séparées par des virgules)",
});

const region = process.env.CMS_REGION || "europe-west1";
const emulator = process.env.FUNCTIONS_EMULATOR === "true";
const enforceAppCheck = process.env.CMS_ENFORCE_APP_CHECK === "true";

function projectId(): string {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId ?? "";
  } catch {
    return "";
  }
}

function builder(): Builder {
  const configured = process.env.CMS_BUILDER;
  if (configured === "local" || configured === "cloud-build") return configured;
  return emulator ? "local" : "cloud-build";
}

function hostingSite(): string {
  return process.env.CMS_HOSTING_SITE || projectId();
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
 * Grants the `cms_owner` claim to the signed-in user when their verified email matches
 * `CMS_OWNER_EMAIL`. The admin calls it right after sign-in.
 */
export const cmsClaimOwner = onCall({ region, enforceAppCheck }, async (request) => {
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
  // IndexNow key, published with the site (announces the changed pages to Bing, Copilot…).
  await ensureIndexNowKey(db).catch((error) => logger.warn("IndexNow key not created", error));
  // What the legal pages say: the data's region, and whether the messages are e-mailed.
  await recordSiteFacts(db, { region, mail: !emulator && Boolean(await mailKey()) }).catch(
    (error) => logger.warn("Site facts not recorded", error),
  );
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
            hostingTarget: process.env.CMS_HOSTING_TARGET || undefined,
            serviceAccount: process.env.CMS_BUILD_SERVICE_ACCOUNT || undefined,
          })
        : await startLocalBuild(
            process.env.CMS_LOCAL_SITE_DIR || path.resolve(process.cwd(), ".."),
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
export const cmsPublish = onCall(
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
export const cmsCreateAgentToken = onCall({ region, enforceAppCheck }, async (request) => {
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
export const cmsAgentConsent = onCall({ region, enforceAppCheck }, async (request) => {
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
const extraHosts = (process.env.CMS_MCP_HOSTS ?? "")
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
  return process.env.CMS_ADMIN_URL || new URL("/admin/", siteOrigin(schema)).toString();
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
 * consent in the admin, tokens), or with an owner-created key (`Authorization: Bearer cmsk_…`, or
 * `?key=cmsk_…` for clients without custom headers).
 */
export const cmsMcp = onRequest(
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
        searchStats: loadSearchStats,
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

/** Best effort, once a publication is live: the changed pages are sent to IndexNow. */
async function announceChanges(release: ReleaseDoc, since: string | undefined) {
  try {
    const [content] = await getStorage().bucket().file(release.snapshotPath).download();
    const result = await notifyIndexNow(parseSnapshot(JSON.parse(content.toString("utf8"))), since);
    logger.info("IndexNow", result);
  } catch (error) {
    logger.warn("IndexNow failed", error);
  }
}

/** Follows Cloud Build (topic `cloud-builds`) and updates the matching release. */
export const cmsOnBuildStatus = onMessagePublished(
  { topic: "cloud-builds", region },
  async (event) => {
    const build = event.data.message.json as CloudBuildEvent;
    const releaseId = build.substitutions?._CMS_RELEASE_ID;
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
      const previous = await db
        .collection(COLLECTIONS.releases)
        .where("status", "==", "live")
        .limit(1)
        .get();
      await markLive(db, releaseId, {
        finishedAt,
        hostingVersion,
        logUrl: build.logUrl ?? current.logUrl,
      });
      await announceChanges(
        current,
        (previous.docs[0]?.data() as ReleaseDoc | undefined)?.createdAt,
      );
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
export const cmsRestoreRelease = onCall({ region, enforceAppCheck }, async (request) => {
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
      `Restauration de ${releaseId}`,
    );
  }
  await markLive(db, releaseId, { restoredAt: new Date().toISOString() });
  return { ok: true };
});

const OPTIMIZED_IMAGES = /^image\/(png|jpeg|webp|avif|gif)$/;
const OPTIMIZED_VIDEOS = /^video\/(mp4|webm|quicktime)$/;

/**
 * Optimizes every file added to the media library (admin upload, AI import): WebP copies of images
 * for `srcset`, 1080p and 720p MP4 copies of videos with a poster (see `media.ts`). The copies are
 * recorded in the library entry and used by the next publications; the original is kept.
 */
export const cmsOptimizeMedia = onObjectFinalized(
  { region, memory: "4GiB", cpu: 2, timeoutSeconds: 540, maxInstances: 3 },
  async (event) => {
    const { name, contentType = "", bucket: bucketName, size } = event.data;
    if (!name || !isOriginalMedia(name)) return;
    const image = OPTIMIZED_IMAGES.test(contentType);
    if (!image && !OPTIMIZED_VIDEOS.test(contentType)) return;
    const db = getFirestore();
    const bucket = getStorage().bucket(bucketName);
    const ref = await mediaEntry(db, name, {
      path: name,
      url: publicStorageUrl(bucketName, name),
      name: path.basename(name),
      contentType,
      size: Number(size) || 0,
      source: "storage",
    });
    const at = () => new Date().toISOString();
    await ref.update({ optimization: { status: "pending", at: at() } });
    try {
      const storage = {
        bucketName,
        publicUrl: (file: string) =>
          `${storageBaseUrl()}/v0/b/${bucketName}/o/${encodeURIComponent(file)}?alt=media`,
        download: async (file: string) => (await bucket.file(file).download())[0],
        upload: (file: string, data: Buffer, type: string) =>
          bucket.file(file).save(data, {
            contentType: type,
            resumable: false,
            metadata: { cacheControl: "public, max-age=31536000, immutable" },
          }),
      };
      const result = image
        ? await optimizeImage(storage, name)
        : await optimizeVideo(storage, name);
      await ref.update(
        result
          ? { ...JSON.parse(JSON.stringify(result)), optimization: { status: "done", at: at() } }
          : { optimization: { status: "skipped", at: at() } },
      );
    } catch (error) {
      logger.error("OpenFlow media optimization failed", { name, error: String(error) });
      await ref.update({
        optimization: { status: "failed", at: at(), error: String(error).slice(0, 300) },
      });
    }
  },
);

const google = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const searchAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});

const searchCache = new Map<number, { at: number; value: SearchStatsResult }>();

/** Search Console's figures of the last `days` days, kept 30 minutes per instance. */
async function loadSearchStats(days: number): Promise<SearchStatsResult> {
  // The emulators cannot reach Google: the owner sees how to connect.
  if (emulator) return { status: "not-connected", properties: 0 };
  const cached = searchCache.get(days);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.value;
  const settings = (
    await getFirestore().collection(COLLECTIONS.site).doc(DOCS.settings).get()
  ).data() as SettingsDoc | undefined;
  const value = await searchStats(
    {
      siteUrl: settings?.site?.url,
      today: statsDay(new Date()),
      serviceAccount: async () => (await searchAuth.getCredentials()).client_email ?? undefined,
      request: async <T>(url: string, body?: unknown) => {
        const client = await searchAuth.getClient();
        const response = await client.request<T>({
          url,
          method: body ? "POST" : "GET",
          ...(body ? { data: body } : {}),
        });
        return response.data;
      },
    },
    days,
  );
  if (value.status === "ok") searchCache.set(days, { at: Date.now(), value });
  return value;
}

/** « Recherche Google » in Statistiques (owner only). */
export const cmsSearchStats = onCall({ region, enforceAppCheck }, async (request) => {
  assertOwner(request);
  const asked = Number((request.data as { days?: unknown } | undefined)?.days);
  return loadSearchStats([7, 28, 90].includes(asked) ? asked : 28);
});

let liveCache: { releaseId: string; snapshot: Snapshot } | undefined;

/** The site as published: the snapshot of the live release (cached per release). */
async function liveSnapshot(): Promise<Snapshot | undefined> {
  const live = await getFirestore()
    .collection(COLLECTIONS.releases)
    .where("status", "==", "live")
    .limit(1)
    .get();
  const release = live.docs[0];
  const file = (release?.data() as ReleaseDoc | undefined)?.snapshotPath;
  if (!release || !file) return undefined;
  if (liveCache?.releaseId === release.id) return liveCache.snapshot;
  const [data] = await getStorage().bucket().file(file).download();
  liveCache = { releaseId: release.id, snapshot: parseSnapshot(JSON.parse(data.toString("utf8"))) };
  return liveCache.snapshot;
}

/** reCAPTCHA Enterprise assessment of a form token (score 0 to 1). */
async function recaptchaScore(token: string, siteKey: string): Promise<number | undefined> {
  try {
    const client = await google.getClient();
    const response = await client.request<{
      tokenProperties?: { valid?: boolean; action?: string };
      riskAnalysis?: { score?: number };
    }>({
      url: `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId()}/assessments`,
      method: "POST",
      data: { event: { token: token.slice(0, 4000), siteKey, expectedAction: "contact" } },
    });
    if (!response.data.tokenProperties?.valid) return 0;
    return response.data.riskAnalysis?.score;
  } catch (error) {
    // Never lose a message because the check is unavailable.
    logger.warn("OpenFlow reCAPTCHA assessment failed", { error: String(error) });
    return undefined;
  }
}

/** Secret Manager secret holding the Resend key (`openflow mail`), optional. */
const MAIL_SECRET = "cms-mail-key";
let mailKeyCache: { at: number; key?: string } | undefined;

async function mailKey(): Promise<string | undefined> {
  if (mailKeyCache && Date.now() - mailKeyCache.at < 10 * 60 * 1000) return mailKeyCache.key;
  let key: string | undefined;
  try {
    const client = await google.getClient();
    const response = await client.request<{ payload?: { data?: string } }>({
      url: `https://secretmanager.googleapis.com/v1/projects/${projectId()}/secrets/${MAIL_SECRET}/versions/latest:access`,
    });
    key =
      Buffer.from(response.data.payload?.data ?? "", "base64")
        .toString("utf8")
        .trim() || undefined;
  } catch {
    key = undefined;
  }
  mailKeyCache = { at: Date.now(), key };
  return key;
}

/** E-mails the owner with Resend, when `openflow mail` configured it. */
async function mailOwner(
  write: (adminUrl: string) => { subject: string; text: string; html: string },
  replyTo: string | undefined,
): Promise<boolean> {
  const key = emulator ? undefined : await mailKey();
  if (!key) return false;
  const owners = parseOwners(ownerEmail.value());
  if (owners.length === 0) return false;
  const email = write(adminUrl(await loadSiteSchema(getFirestore())));
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.CMS_MAIL_FROM || "Site web <onboarding@resend.dev>",
      to: owners,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...email,
    }),
  });
  if (!response.ok) logger.warn("OpenFlow e-mail not sent", { status: response.status });
  return response.ok;
}

/** A new message of a form, e-mailed to the owner. */
const notifyOwner = (message: MessageDoc) =>
  mailOwner((url) => messageEmail(message, url), message.email);

/**
 * Forms of the published site: `POST /forms/submit` (Hosting rewrite), checked against the
 * published page and the spam defences, then recorded for the owner (admin « Messages »).
 */
export const cmsSubmitForm = onRequest(
  { region, memory: "256MiB", maxInstances: 5, invoker: "public", cors: false },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    if (req.method !== "POST") {
      res.set("Allow", "POST, OPTIONS").status(405).json({ ok: false, error: "Utilisez POST." });
      return;
    }
    if (JSON.stringify(req.body ?? {}).length > MAX_BODY_BYTES) {
      res.status(413).json({ ok: false, error: "Message trop long." });
      return;
    }
    const ip =
      String(req.headers["x-forwarded-for"] ?? req.ip ?? "")
        .split(",")[0]
        ?.trim() ?? "";
    try {
      const result = await handleSubmission((req.body ?? {}) as SubmitBody, ip, {
        db: getFirestore(),
        liveSnapshot,
        recaptchaScore: emulator ? undefined : recaptchaScore,
        notify: notifyOwner,
        log: (message, data) => logger.info(message, data),
        salt: projectId(),
      });
      res.status(result.status).json(result.body);
    } catch (error) {
      logger.error("OpenFlow form failed", { error: String(error) });
      res.status(500).json({ ok: false, error: "Envoi impossible pour le moment : réessayez." });
    }
  },
);

/**
 * Appointments of the published site: `GET /cms/booking` gives the times taken, `POST` books one
 * (see `booking.ts`). The owner reads them in the admin (« Rendez-vous ») and by e-mail.
 */
export const cmsBooking = onRequest(
  { region, memory: "256MiB", maxInstances: 5, invoker: "public", cors: false },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    const db = getFirestore();
    try {
      if (req.method === "GET") {
        const result = await handleBusy(req.query as Record<string, unknown>, { db, liveSnapshot });
        res.status(result.status).json(result.body);
        return;
      }
      if (req.method !== "POST") {
        res.set("Allow", "GET, POST, OPTIONS").status(405).json({ ok: false });
        return;
      }
      if (JSON.stringify(req.body ?? {}).length > MAX_BODY_BYTES) {
        res.status(413).json({ ok: false, error: "Demande trop longue." });
        return;
      }
      const ip =
        String(req.headers["x-forwarded-for"] ?? req.ip ?? "")
          .split(",")[0]
          ?.trim() ?? "";
      const result = await handleBooking((req.body ?? {}) as BookingBody, ip, {
        db,
        liveSnapshot,
        recaptchaScore: emulator ? undefined : recaptchaScore,
        notify: (booking) => mailOwner((url) => bookingEmail(booking, url), booking.email),
        log: (message, data) => logger.info(message, data),
        salt: projectId(),
      });
      res.status(result.status).json(result.body);
    } catch (error) {
      logger.error("OpenFlow booking failed", { error: String(error) });
      res
        .status(500)
        .json({ ok: false, error: "Réservation impossible pour le moment : réessayez." });
    }
  },
);

let pagesCache: { at: number; value: Awaited<ReturnType<typeof livePagesUncached>> } | undefined;

async function livePagesUncached() {
  const snapshot = await liveSnapshot();
  if (!snapshot) return undefined;
  let host: string | undefined;
  try {
    host = snapshot.site.url ? new URL(snapshot.site.url).hostname : undefined;
  } catch {
    host = undefined;
  }
  return {
    // Every language of the site (`/en/…`).
    paths: new Set(publishedPaths(snapshot)),
    host,
    off: snapshot.site.stats === "off",
  };
}

/** Pages of the published site, looked up at most once a minute (one read per view otherwise). */
async function livePages() {
  if (pagesCache && Date.now() - pagesCache.at < 60_000) return pagesCache.value;
  const value = await livePagesUncached();
  pagesCache = { at: Date.now(), value };
  return value;
}

/**
 * Audience without cookies: `POST /cms/view` (Hosting rewrite), one beacon per page view of the
 * published site, added to the day's counters (« Statistiques » in the admin). Always answers 204,
 * so a beacon never shows an error in the visitor's console.
 */
export const cmsPageView = onRequest(
  { region, memory: "256MiB", maxInstances: 5, invoker: "public", cors: false },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res
        .set("Allow", "POST")
        .status(req.method === "OPTIONS" ? 204 : 405)
        .end();
      return;
    }
    const ip =
      String(req.headers["x-forwarded-for"] ?? req.ip ?? "")
        .split(",")[0]
        ?.trim() ?? "";
    try {
      await recordPageView(
        parseBeacon(req.rawBody ?? req.body),
        { userAgent: req.get("user-agent"), ip },
        { db: getFirestore(), livePages, salt: projectId() },
      );
    } catch (error) {
      logger.warn("OpenFlow page view not counted", { error: String(error) });
    }
    res.status(204).end();
  },
);

/**
 * Every morning, the online site catches up with the calendar: when an event of the agenda or an
 * exceptional closure is over since the last build, the online version is rebuilt as it is (its
 * snapshot re-dated, never the owner's drafts). Nothing happens on the other days.
 */
export const cmsDailyRefresh = onSchedule(
  { schedule: "every day 04:20", timeZone: "Europe/Paris", region, retryCount: 0 },
  async () => {
    if (emulator) return;
    const db = getFirestore();
    const live = (
      await db.collection(COLLECTIONS.releases).where("status", "==", "live").limit(1).get()
    ).docs[0];
    const release = live?.data() as ReleaseDoc | undefined;
    if (!release?.snapshotPath || release.builder !== "cloud-build" || !release.sourcePath) return;
    if (await runningRelease(db)) return;
    const schema = await loadSiteSchema(db);
    if (!schema) return;
    const bucket = getStorage().bucket();
    const [content] = await bucket.file(release.snapshotPath).download();
    const snapshot = parseSnapshot(JSON.parse(content.toString("utf8")));
    const reasons = outdatedSince(snapshot, configFromSchema(schema), {
      from: statsDay(new Date(snapshot.createdAt)),
      to: statsDay(new Date()),
    });
    if (reasons.length === 0) return;

    const ref = db.collection(COLLECTIONS.releases).doc();
    const createdAt = new Date().toISOString();
    const file = snapshotPath(ref.id);
    await bucket.file(file).save(JSON.stringify({ ...snapshot, releaseId: ref.id, createdAt }), {
      contentType: "application/json",
      resumable: false,
    });
    await ref.set({
      status: "queued",
      createdAt,
      createdBy: REFRESH_AUTHOR,
      snapshotPath: file,
      sourcePath: release.sourcePath,
      builder: "cloud-build",
      pageCount: snapshot.pages.length,
      contentAt: publishedAt(release),
    } satisfies ReleaseDoc);
    try {
      const started = await startCloudBuild({
        projectId: projectId(),
        bucket: bucket.name,
        sourcePath: release.sourcePath,
        snapshotPath: file,
        releaseId: ref.id,
        hostingTarget: process.env.CMS_HOSTING_TARGET || undefined,
        serviceAccount: process.env.CMS_BUILD_SERVICE_ACCOUNT || undefined,
      });
      await ref.update({ status: "building", ...started });
      logger.info("OpenFlow daily refresh", { releaseId: ref.id, reasons });
    } catch (error) {
      await ref.update({
        status: "failed",
        error: (error as Error).message,
        finishedAt: new Date().toISOString(),
      });
      logger.error(PUBLICATION_FAILED_LOG, {
        releaseId: ref.id,
        reason: `Mise à jour automatique : ${(error as Error).message}`,
      });
    }
  },
);

/**
 * Every quarter of an hour, the pages whose scheduled time has come (« Mise en ligne programmée »)
 * are added to the online site as they are, and only them: the owner's other drafts stay drafts
 * (see `schedule.ts`). With the emulators, the local build is used.
 */
export const cmsScheduledPublish = onSchedule(
  { schedule: "*/15 * * * *", timeZone: "Europe/Paris", region, retryCount: 0 },
  async () => {
    const db = getFirestore();
    const pages = db.collection(COLLECTIONS.pages);
    const bucket = getStorage().bucket();
    const result = await publishScheduled(
      {
        scheduledPages: async () =>
          (await pages.where("publishAt", ">", "").get()).docs.map((doc) => ({
            id: doc.id,
            publishAt: doc.get("publishAt") as string | undefined,
          })),
        running: async () => Boolean(await runningRelease(db)),
        liveRelease: async () =>
          (
            await db.collection(COLLECTIONS.releases).where("status", "==", "live").limit(1).get()
          ).docs[0]?.data() as ReleaseDoc | undefined,
        loadSnapshot: async (file) => {
          const [content] = await bucket.file(file).download();
          return parseSnapshot(JSON.parse(content.toString("utf8")));
        },
        loadPages: (ids) => pagesFromFirestore(db, ids),
        newReleaseId: () => db.collection(COLLECTIONS.releases).doc().id,
        release: async (id, snapshot, release) => {
          const ref = db.collection(COLLECTIONS.releases).doc(id);
          const file = snapshotPath(id);
          await bucket
            .file(file)
            .save(JSON.stringify(snapshot), { contentType: "application/json", resumable: false });
          await ref.set({ ...release, snapshotPath: file } satisfies ReleaseDoc);
          try {
            if (release.builder === "cloud-build" && !release.sourcePath)
              throw new Error("le code du site en ligne est introuvable");
            const started =
              release.builder === "cloud-build"
                ? await startCloudBuild({
                    projectId: projectId(),
                    bucket: bucket.name,
                    sourcePath: release.sourcePath as string,
                    snapshotPath: file,
                    releaseId: id,
                    hostingTarget: process.env.CMS_HOSTING_TARGET || undefined,
                    serviceAccount: process.env.CMS_BUILD_SERVICE_ACCOUNT || undefined,
                  })
                : await startLocalBuild(
                    process.env.CMS_LOCAL_SITE_DIR || path.resolve(process.cwd(), ".."),
                    snapshot,
                    id,
                  );
            await ref.update({ status: "building", ...started });
          } catch (error) {
            await ref.update({
              status: "failed",
              error: (error as Error).message,
              finishedAt: new Date().toISOString(),
            });
            throw error;
          }
        },
        markPublished: async (ids) => {
          const batch = db.batch();
          for (const id of ids) {
            batch.update(pages.doc(id), { status: "published", publishAt: FieldValue.delete() });
          }
          await batch.commit();
        },
      },
      new Date().toISOString(),
    );
    if (result.done === "failed") {
      logger.error(PUBLICATION_FAILED_LOG, {
        reason: `Publication programmée : ${result.error}`,
        pages: result.pages,
      });
    } else if (result.done !== "nothing") {
      logger.info("OpenFlow scheduled publication", result);
    }
  },
);
