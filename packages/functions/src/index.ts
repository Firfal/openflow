import path from "node:path";
import { COLLECTIONS, OWNER_CLAIM, type ReleaseDoc, SnapshotError } from "@openflow/core";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { type CallableRequest, HttpsError, onCall } from "firebase-functions/https";
import { defineString } from "firebase-functions/params";
import { onMessagePublished } from "firebase-functions/pubsub";
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

/**
 * "Publier": freezes the drafts into a snapshot (Cloud Storage), records a release and starts
 * the static build (Cloud Build in production, local `next build` with the emulators).
 */
export const openflowPublish = onCall(
  { region, enforceAppCheck, timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    const token = assertOwner(request);
    const db = getFirestore();
    const running = await runningRelease(db);
    if (running)
      throw new HttpsError(
        "failed-precondition",
        "Une publication est déjà en cours : patientez quelques minutes.",
      );

    const kind = builder();
    const source = kind === "cloud-build" ? await getSource(db) : undefined;
    if (kind === "cloud-build" && !source) {
      throw new HttpsError(
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
        throw new HttpsError(
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
      createdBy: String(token.email ?? request.auth?.uid ?? "inconnu"),
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
      throw new HttpsError(
        "internal",
        `Le build n'a pas pu démarrer : ${(error as Error).message}`,
      );
    }
    return { releaseId: releaseRef.id };
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
