import path from "node:path";
import {
  AGENT_AUTHOR,
  AgentError,
  COLLECTIONS,
  handleMcpMessage,
  OWNER_CLAIM,
  type ReleaseDoc,
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
    logger.error("OpenFlow build could not start", error);
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

function storageBaseUrl(): string {
  const emulated = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (emulated) return emulated.startsWith("http") ? emulated : `http://${emulated}`;
  return "https://firebasestorage.googleapis.com";
}

/**
 * MCP server of the site (Model Context Protocol, Streamable HTTP, stateless): an AI assistant
 * (Claude, ChatGPT…) edits the site by chat with the tools of `@openflow/core` (`AGENT_TOOLS`).
 * Public HTTPS endpoint (`https://<region>-<project>.cloudfunctions.net/openflowMcp`), authenticated
 * with an owner-created key
 * (`Authorization: Bearer ofk_…`, or `?key=ofk_…` for clients without custom headers).
 */
export const openflowMcp = onRequest(
  { region, timeoutSeconds: 120, memory: "512MiB", cors: false, invoker: "public" },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
    );
    res.set("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    if (req.method !== "POST") {
      // Stateless server: no event stream to open, no session to delete.
      res
        .set("Allow", "POST, OPTIONS")
        .status(405)
        .json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32000, message: "Method not allowed: use POST." },
        });
      return;
    }
    const db = getFirestore();
    const key = await verifyAgentToken(
      db,
      tokenFromRequest(
        req.headers as Record<string, unknown>,
        req.query as Record<string, unknown>,
      ),
    );
    if (!key) {
      res
        .set("WWW-Authenticate", 'Bearer realm="OpenFlow"')
        .status(401)
        .json({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32001,
            message:
              "Clé d'accès absente ou révoquée : créez-en une dans l'admin (Réglages > Assistant IA).",
          },
        });
      return;
    }
    const schema = await loadSiteSchema(db);
    if (!schema) {
      res.status(503).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32002, message: "Schéma du site absent : lancez `openflow deploy`." },
      });
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
