import { DEMO_PROJECT_ID } from "@openflow/core";
import { type FirebaseApp, type FirebaseOptions, getApps, initializeApp } from "firebase/app";
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, type Firestore, initializeFirestore } from "firebase/firestore";
import {
  connectFunctionsEmulator,
  type Functions,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import { connectStorageEmulator, type FirebaseStorage, getStorage } from "firebase/storage";

export interface FirebaseSetup {
  /** Web config. Defaults to `/__/firebase/init.json`, served automatically by Firebase Hosting. */
  options?: FirebaseOptions;
  /** Use the local Firebase emulators (`openflow dev`). */
  emulators?: boolean;
  /** Host of the emulators (defaults to the current hostname). */
  emulatorHost?: string;
  /** Region of the OpenFlow Cloud Functions (default `europe-west1`). */
  region?: string;
}

export interface Services {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
  emulators: boolean;
  projectId: string;
  /** Region of the OpenFlow Cloud Functions. */
  region: string;
  /** Host of the emulators, when used. */
  emulatorHost?: string;
}

const APP_NAME = "openflow-admin";
let pending: Promise<Services> | undefined;

async function resolveOptions(setup: FirebaseSetup): Promise<FirebaseOptions> {
  if (setup.options) return setup.options;
  if (setup.emulators) {
    return {
      apiKey: "demo-api-key",
      authDomain: "localhost",
      projectId: DEMO_PROJECT_ID,
      storageBucket: `${DEMO_PROJECT_ID}.appspot.com`,
      appId: "demo-app",
    };
  }
  const response = await fetch("/__/firebase/init.json");
  if (!response.ok) {
    throw new Error(
      "Configuration Firebase introuvable (/__/firebase/init.json). Le site doit être servi par Firebase Hosting, ou passez `firebase.options` à <OpenFlowAdmin />.",
    );
  }
  return (await response.json()) as FirebaseOptions;
}

/** Initializes Firebase once (safe with React strict mode double effects). */
export function initServices(setup: FirebaseSetup = {}): Promise<Services> {
  pending ??= (async () => {
    const options = await resolveOptions(setup);
    const app = getApps().find((a) => a.name === APP_NAME) ?? initializeApp(options, APP_NAME);
    const auth = getAuth(app);
    const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
    const storage = getStorage(app);
    const region = setup.region ?? "europe-west1";
    const functions = getFunctions(app, region);
    const emulators = Boolean(setup.emulators);
    let emulatorHost: string | undefined;
    if (emulators) {
      const host =
        setup.emulatorHost ??
        (typeof window !== "undefined" ? window.location.hostname : "127.0.0.1");
      connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
      connectFirestoreEmulator(db, host, 8080);
      connectStorageEmulator(storage, host, 9199);
      connectFunctionsEmulator(functions, host, 5001);
      emulatorHost = host;
    }
    return {
      app,
      auth,
      db,
      storage,
      functions,
      emulators,
      projectId: options.projectId ?? "",
      region,
      emulatorHost,
    };
  })();
  return pending;
}

/** Calls an OpenFlow callable function and returns its data. */
export async function call<Req, Res>(services: Services, name: string, data: Req): Promise<Res> {
  const fn = httpsCallable<Req, Res>(services.functions, name, { timeout: 120_000 });
  return (await fn(data)).data;
}

/** Human-readable French message for Firebase errors. */
export function errorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  const message = (error as Error)?.message ?? String(error);
  if (code.endsWith("permission-denied"))
    return "Action refusée : seul le propriétaire du site peut faire cela.";
  if (code.endsWith("unauthenticated")) return "Session expirée : reconnectez-vous.";
  if (code.endsWith("unavailable"))
    return "Service indisponible : vérifiez votre connexion internet.";
  return message.replace(/^Firebase: /, "").replace(/\s*\(.*\)\.?$/, "");
}
