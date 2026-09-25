import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const site =
  process.env.OPENFLOW_E2E_SITE ??
  path.resolve(import.meta.dirname, "../../templates/next-starter");
const [firestoreHost, firestorePort] = (
  process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"
).split(":");
const [storageHost, storagePort] = (
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199"
).split(":");

let env: RulesTestEnvironment;

const page = {
  slug: "test",
  title: "Test",
  status: "published",
  seo: {},
  data: { root: { props: {} }, content: [] },
  updatedAt: "2026-01-01",
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-openflow-rules",
    firestore: {
      rules: readFileSync(path.join(site, "firestore.rules"), "utf8"),
      host: firestoreHost,
      port: Number(firestorePort),
    },
    storage: {
      rules: readFileSync(path.join(site, "storage.rules"), "utf8"),
      host: storageHost,
      port: Number(storagePort),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "of_pages/accueil"), page);
    await setDoc(doc(db, "of_releases/r1"), { status: "live" });
    await setDoc(doc(db, "of_system/source"), { path: "openflow/source/x.tgz" });
    await uploadBytes(
      ref(context.storage(), "openflow/media/photo.png"),
      new Uint8Array([1, 2, 3]),
      { contentType: "image/png" },
    );
    await uploadBytes(ref(context.storage(), "openflow/source/site.tgz"), new Uint8Array([1]), {
      contentType: "application/gzip",
    });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

const owner = () =>
  env.authenticatedContext("owner", {
    email: "proprietaire@exemple.fr",
    email_verified: true,
    of_owner: true,
  });
const intruder = () =>
  env.authenticatedContext("intruder", { email: "intrus@exemple.fr", email_verified: true });
const anonymous = () => env.unauthenticatedContext();

describe("Firestore rules", () => {
  it("lets the owner read and edit pages and settings", async () => {
    const db = owner().firestore();
    await assertSucceeds(getDoc(doc(db, "of_pages/accueil")));
    await assertSucceeds(updateDoc(doc(db, "of_pages/accueil"), { title: "Nouveau titre" }));
    await assertSucceeds(setDoc(doc(db, "of_pages/nouvelle"), { ...page, slug: "nouvelle" }));
    await assertSucceeds(setDoc(doc(db, "of_site/settings"), { site: { name: "X" }, values: {} }));
    await assertSucceeds(getDoc(doc(db, "of_releases/r1")));
  });

  it("validates page documents", async () => {
    const db = owner().firestore();
    await assertFails(updateDoc(doc(db, "of_pages/accueil"), { status: "publie" }));
    await assertFails(setDoc(doc(db, "of_pages/incomplete"), { title: "Sans slug" }));
  });

  it("never lets the client write releases or system documents", async () => {
    const db = owner().firestore();
    await assertFails(setDoc(doc(db, "of_releases/r2"), { status: "live" }));
    await assertFails(getDoc(doc(db, "of_system/source")));
    await assertFails(setDoc(doc(db, "of_system/source"), { path: "evil" }));
  });

  for (const [who, context] of [
    ["an authenticated non-owner", intruder],
    ["an anonymous visitor", anonymous],
  ] as const) {
    it(`denies everything to ${who}`, async () => {
      const db = context().firestore();
      await assertFails(getDoc(doc(db, "of_pages/accueil")));
      await assertFails(updateDoc(doc(db, "of_pages/accueil"), { title: "Piraté" }));
      await assertFails(getDoc(doc(db, "of_site/settings")));
      await assertFails(setDoc(doc(db, "of_site/settings"), { values: {} }));
      await assertFails(getDoc(doc(db, "of_releases/r1")));
    });
  }
});

describe("Storage rules", () => {
  const png = new Uint8Array([137, 80, 78, 71]);

  it("serves media publicly, but only the owner uploads images", async () => {
    await assertSucceeds(getBytes(ref(anonymous().storage(), "openflow/media/photo.png")));
    await assertSucceeds(
      uploadBytes(ref(owner().storage(), "openflow/media/new.png"), png, {
        contentType: "image/png",
      }),
    );
    await assertFails(
      uploadBytes(ref(intruder().storage(), "openflow/media/evil.png"), png, {
        contentType: "image/png",
      }),
    );
    await assertFails(
      uploadBytes(ref(anonymous().storage(), "openflow/media/evil.png"), png, {
        contentType: "image/png",
      }),
    );
  });

  it("rejects risky file types and private paths", async () => {
    await assertFails(
      uploadBytes(ref(owner().storage(), "openflow/media/x.svg"), png, {
        contentType: "image/svg+xml",
      }),
    );
    await assertFails(
      uploadBytes(ref(owner().storage(), "openflow/media/x.html"), png, {
        contentType: "text/html",
      }),
    );
    await assertFails(getBytes(ref(anonymous().storage(), "openflow/source/site.tgz")));
    await assertFails(getBytes(ref(owner().storage(), "openflow/source/site.tgz")));
    await assertFails(
      uploadBytes(ref(owner().storage(), "openflow/source/evil.tgz"), png, {
        contentType: "application/gzip",
      }),
    );
  });
});
