import type { FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, initializeFirestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";
import type { AuthServices, Services } from "./firebase.js";

/** Adds Firestore to the Firebase app once the owner is signed in (dashboard stage). */
export function withFirestore(base: AuthServices): Services {
  const db = initializeFirestore(base.app, { ignoreUndefinedProperties: true });
  if (base.emulatorHost) connectFirestoreEmulator(db, base.emulatorHost, 8080);
  return { ...base, db };
}

const storageByApp = new WeakMap<FirebaseApp, Promise<FirebaseStorage>>();

/** Cloud Storage, imported the first time a file is uploaded. */
export function storageOf(services: AuthServices): Promise<FirebaseStorage> {
  let storage = storageByApp.get(services.app);
  if (!storage) {
    storage = import("firebase/storage").then((sdk) => {
      const instance = sdk.getStorage(services.app);
      if (services.emulatorHost) sdk.connectStorageEmulator(instance, services.emulatorHost, 9199);
      return instance;
    });
    storageByApp.set(services.app, storage);
  }
  return storage;
}
