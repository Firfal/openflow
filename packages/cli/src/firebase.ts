import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_PROJECT_ID } from "@openflow/core";
import { type App, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { CliError } from "./util.js";

export const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
  functions: 5001,
  hosting: 5000,
  ui: 4000,
};

/** Environment variables that point the Admin SDK to the local emulators. */
export function emulatorEnv(host = "127.0.0.1"): Record<string, string> {
  return {
    FIRESTORE_EMULATOR_HOST: `${host}:${EMULATOR_PORTS.firestore}`,
    FIREBASE_AUTH_EMULATOR_HOST: `${host}:${EMULATOR_PORTS.auth}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `${host}:${EMULATOR_PORTS.storage}`,
    GCLOUD_PROJECT: DEMO_PROJECT_ID,
  };
}

/** Reads the default project from `.firebaserc`. */
export async function defaultProject(site: string): Promise<string | undefined> {
  const file = path.join(site, ".firebaserc");
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(await readFile(file, "utf8"))?.projects?.default;
  } catch {
    return undefined;
  }
}

export interface AdminHandle {
  app: App;
  projectId: string;
  emulator: boolean;
  close: () => Promise<void>;
}

/**
 * Admin SDK for the CLI. With `emulator`, targets the local emulators (no credentials needed);
 * otherwise uses Application Default Credentials (`gcloud auth application-default login`).
 */
export function adminApp(options: {
  projectId?: string;
  emulator?: boolean;
  bucket?: string;
}): AdminHandle {
  const emulator = Boolean(options.emulator || process.env.FIRESTORE_EMULATOR_HOST);
  if (options.emulator) Object.assign(process.env, emulatorEnv());
  const projectId = options.projectId ?? (emulator ? DEMO_PROJECT_ID : undefined);
  if (!projectId)
    throw new CliError(
      "Projet Firebase inconnu : passez --project <id> ou ajoutez-le à .firebaserc.",
    );
  const app = initializeApp(
    {
      projectId,
      storageBucket:
        options.bucket ??
        (emulator ? `${projectId}.appspot.com` : `${projectId}.firebasestorage.app`),
    },
    `openflow-cli-${Date.now()}`,
  );
  return { app, projectId, emulator, close: () => deleteApp(app) };
}

const configured = new WeakSet<App>();

export function firestore(handle: AdminHandle) {
  const db = getFirestore(handle.app);
  if (!configured.has(handle.app)) {
    db.settings({ ignoreUndefinedProperties: true });
    configured.add(handle.app);
  }
  return db;
}
export const storage = (handle: AdminHandle) => getStorage(handle.app);
export const auth = (handle: AdminHandle) => getAuth(handle.app);
