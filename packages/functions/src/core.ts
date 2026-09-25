import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  COLLECTIONS,
  createSnapshot,
  DOCS,
  OWNER_CLAIM,
  type PageDoc,
  type ReleaseDoc,
  type ReleaseStatus,
  type SettingsDoc,
  type Snapshot,
  type SourceDoc,
  STORAGE_PATHS,
} from "@openflow/core";
import type { Firestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";

export type Builder = "cloud-build" | "local";

// ---------------------------------------------------------------------------------------------
// Owner

/** Parses `OPENFLOW_OWNER_EMAIL` ("a@x.fr, b@y.fr") into lowercase emails. */
export function parseOwners(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export interface TokenInfo {
  email?: string;
  email_verified?: boolean;
  [claim: string]: unknown;
}

/**
 * Decides whether a signed-in user may become owner. Unverified emails are only accepted by the
 * local emulator (quick sign-in); in production the email must be verified (email link, Google).
 */
export function ownerDecision(
  token: TokenInfo,
  owners: string[],
  emulator: boolean,
):
  | { ok: true }
  | { ok: false; code: "failed-precondition" | "permission-denied"; message: string } {
  if (owners.length === 0) {
    return {
      ok: false,
      code: "failed-precondition",
      message: "Aucun propriétaire n'est configuré (paramètre OPENFLOW_OWNER_EMAIL des fonctions).",
    };
  }
  const email = token.email?.toLowerCase();
  if (!email || !owners.includes(email)) {
    return {
      ok: false,
      code: "permission-denied",
      message: `Le compte ${email ?? "(sans e-mail)"} n'est pas le propriétaire de ce site.`,
    };
  }
  if (!token.email_verified && !emulator) {
    return {
      ok: false,
      code: "permission-denied",
      message:
        "Adresse e-mail non vérifiée : connectez-vous avec le lien reçu par e-mail ou avec Google.",
    };
  }
  return { ok: true };
}

/** True when the ID token carries the owner claim and its email is still an owner. */
export function isOwnerToken(token: TokenInfo | undefined, owners: string[]): boolean {
  if (token?.[OWNER_CLAIM] !== true) return false;
  return owners.length === 0 || owners.includes(String(token?.email ?? "").toLowerCase());
}

// ---------------------------------------------------------------------------------------------
// Snapshot

const FALLBACK_SETTINGS: Pick<SettingsDoc, "site" | "values"> = {
  site: { name: "Site", lang: "fr" },
  values: {},
};

/** Reads drafts and settings from Firestore and freezes them into a snapshot. */
export async function snapshotFromFirestore(db: Firestore, releaseId: string): Promise<Snapshot> {
  const [settingsSnap, pagesSnap] = await Promise.all([
    db.collection(COLLECTIONS.site).doc(DOCS.settings).get(),
    db.collection(COLLECTIONS.pages).get(),
  ]);
  const settings = (settingsSnap.data() as SettingsDoc | undefined) ?? FALLBACK_SETTINGS;
  return createSnapshot({
    releaseId,
    settings: { site: settings.site ?? FALLBACK_SETTINGS.site, values: settings.values ?? {} },
    pages: pagesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as PageDoc) })),
  });
}

export async function getSource(db: Firestore): Promise<SourceDoc | undefined> {
  return (await db.collection(COLLECTIONS.system).doc(DOCS.source).get()).data() as
    | SourceDoc
    | undefined;
}

export function snapshotPath(releaseId: string): string {
  return `${STORAGE_PATHS.snapshots}/${releaseId}.json`;
}

/** A publication started less than 20 minutes ago that has not finished blocks a new one. */
export async function runningRelease(db: Firestore): Promise<string | undefined> {
  const snap = await db
    .collection(COLLECTIONS.releases)
    .where("status", "in", ["queued", "building"])
    .get();
  const limit = Date.now() - 20 * 60 * 1000;
  return snap.docs.find((doc) => new Date((doc.data() as ReleaseDoc).createdAt).getTime() > limit)
    ?.id;
}

// ---------------------------------------------------------------------------------------------
// Cloud Build

export interface BuildInput {
  projectId: string;
  bucket: string;
  sourcePath: string;
  snapshotPath: string;
  releaseId: string;
  /** Firebase Hosting deploy target, when the project has several sites. */
  hostingTarget?: string;
  /** Dedicated build service account email (recommended). */
  serviceAccount?: string;
  nodeImage?: string;
}

const INSTALL_SCRIPT = [
  "set -e",
  "if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile;",
  "elif [ -f yarn.lock ]; then corepack enable && yarn install --immutable;",
  "else npm ci --no-audit --no-fund; fi",
].join("\n");

/** Cloud Build request: install, `next build` with the snapshot, deploy to Firebase Hosting. */
export function buildRequest(input: BuildInput) {
  const node = input.nodeImage ?? "node:22";
  const only = input.hostingTarget ? `hosting:${input.hostingTarget}` : "hosting";
  return {
    source: { storageSource: { bucket: input.bucket, object: input.sourcePath } },
    steps: [
      {
        id: "snapshot",
        name: "gcr.io/cloud-builders/gcloud",
        args: [
          "storage",
          "cp",
          `gs://${input.bucket}/${input.snapshotPath}`,
          "openflow/.snapshot.json",
        ],
      },
      { id: "install", name: node, entrypoint: "bash", args: ["-c", INSTALL_SCRIPT] },
      {
        id: "build",
        name: node,
        entrypoint: "npx",
        args: ["next", "build"],
        env: ["OPENFLOW_SNAPSHOT=openflow/.snapshot.json", "NEXT_TELEMETRY_DISABLED=1"],
      },
      {
        id: "deploy",
        name: node,
        entrypoint: "npx",
        args: [
          "--yes",
          "firebase-tools@15",
          "deploy",
          "--only",
          only,
          "--project",
          input.projectId,
          "--non-interactive",
          "--message",
          `OpenFlow ${input.releaseId}`,
        ],
      },
    ],
    // Read back by onBuildStatus from the Pub/Sub event. No step uses it, hence ALLOW_LOOSE:
    // Cloud Build rejects unused substitutions otherwise.
    substitutions: { _OPENFLOW_RELEASE_ID: input.releaseId },
    tags: ["openflow", `openflow-${input.releaseId.toLowerCase()}`],
    timeout: "1200s",
    options: { logging: "CLOUD_LOGGING_ONLY", substitutionOption: "ALLOW_LOOSE" },
    ...(input.serviceAccount
      ? { serviceAccount: `projects/${input.projectId}/serviceAccounts/${input.serviceAccount}` }
      : {}),
  };
}

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

/** Starts a Cloud Build and returns its id and console URL. */
export async function startCloudBuild(
  input: BuildInput,
): Promise<{ buildId: string; logUrl: string }> {
  const client = await auth.getClient();
  const response = await client.request<{
    metadata?: { build?: { id?: string; logUrl?: string } };
  }>({
    url: `https://cloudbuild.googleapis.com/v1/projects/${input.projectId}/builds`,
    method: "POST",
    data: buildRequest(input),
  });
  const build = response.data.metadata?.build;
  if (!build?.id) throw new Error("Cloud Build n'a pas renvoyé d'identifiant de build");
  return {
    buildId: build.id,
    logUrl:
      build.logUrl ??
      `https://console.cloud.google.com/cloud-build/builds/${build.id}?project=${input.projectId}`,
  };
}

/** Subset of the Cloud Build resource published on the `cloud-builds` Pub/Sub topic. */
export interface CloudBuildEvent {
  id?: string;
  status?: string;
  logUrl?: string;
  finishTime?: string;
  failureInfo?: { detail?: string };
  statusDetail?: string;
  substitutions?: Record<string, string>;
}

/** Maps a Cloud Build status to the release status (undefined = ignore). */
export function releaseStatusFromBuild(build: CloudBuildEvent): ReleaseStatus | undefined {
  switch (build.status) {
    case "QUEUED":
    case "PENDING":
      return "queued";
    case "WORKING":
      return "building";
    case "SUCCESS":
      return "live";
    case "FAILURE":
    case "INTERNAL_ERROR":
    case "TIMEOUT":
    case "CANCELLED":
    case "EXPIRED":
      return "failed";
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// Firebase Hosting

const HOSTING_API = "https://firebasehosting.googleapis.com/v1beta1";

/** Version name (`sites/x/versions/y`) currently released on the live channel. */
export async function currentHostingVersion(site: string): Promise<string | undefined> {
  const client = await auth.getClient();
  const response = await client.request<{ releases?: Array<{ version?: { name?: string } }> }>({
    url: `${HOSTING_API}/sites/${site}/releases?pageSize=1`,
  });
  return response.data.releases?.[0]?.version?.name;
}

/** Re-releases an existing Hosting version on the live channel (instant rollback). */
export async function releaseHostingVersion(
  site: string,
  versionName: string,
  message: string,
): Promise<void> {
  const client = await auth.getClient();
  await client.request({
    url: `${HOSTING_API}/sites/${site}/releases?versionName=${encodeURIComponent(versionName)}`,
    method: "POST",
    data: { message },
  });
}

const FIREBASE_API = "https://firebase.googleapis.com/v1beta1";

/**
 * The admin reads its Firebase configuration from `/__/firebase/init.json`, which Hosting only
 * serves completely when a web app is linked to the site. Links an existing web app, or creates
 * one, and returns its id.
 */
export async function ensureWebApp(
  projectId: string,
  site = projectId,
): Promise<{ appId: string; created: boolean }> {
  const client = await auth.getClient();
  const siteUrl = `${HOSTING_API}/projects/${projectId}/sites/${site}`;
  const current = await client.request<{ appId?: string }>({ url: siteUrl });
  if (current.data.appId) return { appId: current.data.appId, created: false };

  const apps = await client.request<{ apps?: Array<{ appId: string; state?: string }> }>({
    url: `${FIREBASE_API}/projects/${projectId}/webApps`,
  });
  let appId = apps.data.apps?.find((app) => app.state !== "DELETED")?.appId;
  const created = !appId;
  if (!appId) {
    type Operation = {
      name: string;
      done?: boolean;
      response?: { appId?: string };
      error?: { message?: string };
    };
    let operation = (
      await client.request<Operation>({
        url: `${FIREBASE_API}/projects/${projectId}/webApps`,
        method: "POST",
        data: { displayName: "OpenFlow" },
      })
    ).data;
    for (let attempt = 0; !operation.done && attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      operation = (await client.request<Operation>({ url: `${FIREBASE_API}/${operation.name}` }))
        .data;
    }
    appId = operation.response?.appId;
    if (!appId) {
      throw new Error(
        `Création de l'application Web impossible : ${operation.error?.message ?? "délai dépassé"}`,
      );
    }
  }
  await client.request({ url: `${siteUrl}?updateMask=appId`, method: "PATCH", data: { appId } });
  return { appId, created };
}

/** Marks every other live release as superseded and `releaseId` as live. */
export async function markLive(
  db: Firestore,
  releaseId: string,
  patch: Partial<ReleaseDoc>,
): Promise<void> {
  const live = await db.collection(COLLECTIONS.releases).where("status", "==", "live").get();
  const batch = db.batch();
  for (const doc of live.docs) {
    if (doc.id !== releaseId) batch.update(doc.ref, { status: "superseded" });
  }
  batch.update(db.collection(COLLECTIONS.releases).doc(releaseId), { ...patch, status: "live" });
  await batch.commit();
}

// ---------------------------------------------------------------------------------------------
// Local builder (emulators)

/**
 * Emulator builder: writes the snapshot next to the site and runs `openflow build --report`,
 * detached, which updates the release document when `next build` finishes.
 */
export async function startLocalBuild(
  siteDir: string,
  snapshot: Snapshot,
  releaseId: string,
): Promise<{ buildId: string }> {
  const file = path.join(siteDir, "openflow", ".snapshot.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(snapshot, null, 2));
  const child = spawn(
    "npx",
    ["--no-install", "openflow", "build", "--snapshot", file, "--report", releaseId],
    {
      cwd: siteDir,
      detached: true,
      stdio: "ignore",
      env: process.env,
    },
  );
  child.unref();
  return { buildId: `local-${releaseId}` };
}
