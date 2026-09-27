import { DEMO_PROJECT_ID } from "@openflow/core";
import { type FirebaseApp, type FirebaseOptions, getApps, initializeApp } from "firebase/app";
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { Functions } from "firebase/functions";

/**
 * Firebase, loaded in stages like the rest of the admin: the login screen only needs Firebase Auth
 * (this module); Firestore comes with the dashboard (`services.ts`), and Cloud Functions and Storage
 * are imported the first time they are used.
 */

export interface FirebaseSetup {
  /** Web config. Defaults to `/__/firebase/init.json`, served automatically by Firebase Hosting. */
  options?: FirebaseOptions;
  /** Use the local Firebase emulators (`openflow dev`). */
  emulators?: boolean;
  /** Host of the emulators (defaults to the current hostname). */
  emulatorHost?: string;
  /** Region of the Cloud Functions (default `europe-west1`). */
  region?: string;
}

/** What the login screen needs: the Firebase app and its authentication. */
export interface AuthServices {
  app: FirebaseApp;
  auth: Auth;
  emulators: boolean;
  projectId: string;
  /** Region of the Cloud Functions. */
  region: string;
  /** Host of the emulators, when used. */
  emulatorHost?: string;
}

/** Everything the signed-in owner uses (the dashboard adds Firestore, see `services.ts`). */
export interface Services extends AuthServices {
  db: Firestore;
}

const APP_NAME = "openflow-admin";
let pending: Promise<AuthServices> | undefined;

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

/** Initializes the Firebase app and its authentication, once (safe with React strict mode). */
export function initAuth(setup: FirebaseSetup = {}): Promise<AuthServices> {
  pending ??= (async () => {
    const options = await resolveOptions(setup);
    const app = getApps().find((a) => a.name === APP_NAME) ?? initializeApp(options, APP_NAME);
    const auth = getAuth(app);
    const emulators = Boolean(setup.emulators);
    let emulatorHost: string | undefined;
    if (emulators) {
      emulatorHost =
        setup.emulatorHost ??
        (typeof window !== "undefined" ? window.location.hostname : "127.0.0.1");
      connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    }
    return {
      app,
      auth,
      emulators,
      projectId: options.projectId ?? "",
      region: setup.region ?? "europe-west1",
      emulatorHost,
    };
  })();
  return pending;
}

const functionsByApp = new WeakMap<FirebaseApp, Promise<Functions>>();

/** Cloud Functions, imported the first time a function is called. */
function functionsOf(services: AuthServices): Promise<Functions> {
  let functions = functionsByApp.get(services.app);
  if (!functions) {
    functions = import("firebase/functions").then((sdk) => {
      const instance = sdk.getFunctions(services.app, services.region);
      if (services.emulatorHost)
        sdk.connectFunctionsEmulator(instance, services.emulatorHost, 5001);
      return instance;
    });
    functionsByApp.set(services.app, functions);
  }
  return functions;
}

/** Calls a callable Cloud Function and returns its data. */
export async function call<Req, Res>(
  services: AuthServices,
  name: string,
  data: Req,
): Promise<Res> {
  const [functions, { httpsCallable }] = await Promise.all([
    functionsOf(services),
    import("firebase/functions"),
  ]);
  const fn = httpsCallable<Req, Res>(functions, name, { timeout: 120_000 });
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
