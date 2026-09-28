import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const site =
  process.env.CMS_E2E_SITE ?? path.resolve(import.meta.dirname, "../../templates/next-starter");
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
  updatedAt: "2026-01-01",
};
const content = { data: { root: { props: {} }, content: [] }, updatedAt: "2026-01-01" };

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
    await setDoc(doc(db, "cms_pages/accueil"), page);
    await setDoc(doc(db, "cms_page_content/accueil"), content);
    await setDoc(doc(db, "cms_releases/r1"), { status: "live" });
    await setDoc(doc(db, "cms_system/source"), { path: "cms/source/x.tgz" });
    await setDoc(doc(db, "cms_system/integrations"), { region: "europe-west1", mail: "resend" });
    await setDoc(doc(db, "cms_agent_tokens/k1"), {
      label: "Claude",
      hash: "abc",
      prefix: "cmsk_ab",
    });
    await setDoc(doc(db, "cms_agent_clients/cmscli_a"), { name: "Claude", redirectUris: [] });
    await setDoc(doc(db, "cms_agent_requests/r1"), { clientId: "cmscli_a" });
    await setDoc(doc(db, "cms_agent_codes/c1"), { clientId: "cmscli_a" });
    await setDoc(doc(db, "cms_stats/2026-09-27-0"), { day: "2026-09-27", views: 3 });
    await uploadBytes(ref(context.storage(), "cms/media/photo.png"), new Uint8Array([1, 2, 3]), {
      contentType: "image/png",
    });
    await uploadBytes(ref(context.storage(), "cms/source/site.tgz"), new Uint8Array([1]), {
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
    cms_owner: true,
  });
const intruder = () =>
  env.authenticatedContext("intruder", { email: "intrus@exemple.fr", email_verified: true });
const anonymous = () => env.unauthenticatedContext();

describe("Firestore rules", () => {
  it("lets the owner read and edit pages and settings", async () => {
    const db = owner().firestore();
    await assertSucceeds(getDoc(doc(db, "cms_pages/accueil")));
    await assertSucceeds(updateDoc(doc(db, "cms_pages/accueil"), { title: "Nouveau titre" }));
    await assertSucceeds(setDoc(doc(db, "cms_pages/nouvelle"), { ...page, slug: "nouvelle" }));
    await assertSucceeds(getDoc(doc(db, "cms_page_content/accueil")));
    await assertSucceeds(setDoc(doc(db, "cms_page_content/nouvelle"), content));
    await assertSucceeds(setDoc(doc(db, "cms_site/settings"), { site: { name: "X" }, values: {} }));
    await assertSucceeds(getDoc(doc(db, "cms_releases/r1")));
  });

  it("validates page documents", async () => {
    const db = owner().firestore();
    await assertFails(updateDoc(doc(db, "cms_pages/accueil"), { status: "publie" }));
    await assertFails(setDoc(doc(db, "cms_pages/incomplete"), { title: "Sans slug" }));
    // The content of a page is a Puck data object.
    await assertFails(setDoc(doc(db, "cms_page_content/accueil"), { data: "texte" }));
  });

  it("never lets the client write releases or system documents", async () => {
    const db = owner().firestore();
    await assertFails(setDoc(doc(db, "cms_releases/r2"), { status: "live" }));
    await assertFails(getDoc(doc(db, "cms_system/source")));
    await assertFails(setDoc(doc(db, "cms_system/source"), { path: "evil" }));
  });

  it("lets the owner read the public facts of the integrations (legal pages), never write them", async () => {
    const db = owner().firestore();
    await assertSucceeds(getDoc(doc(db, "cms_system/integrations")));
    await assertFails(setDoc(doc(db, "cms_system/integrations"), { mail: "evil" }));
  });

  it("lets the owner list and revoke assistant keys, never create them", async () => {
    const db = owner().firestore();
    await assertSucceeds(getDoc(doc(db, "cms_agent_tokens/k1")));
    await assertFails(setDoc(doc(db, "cms_agent_tokens/k2"), { hash: "mine" }));
    await assertFails(updateDoc(doc(db, "cms_agent_tokens/k1"), { hash: "mine" }));
    await assertSucceeds(deleteDoc(doc(db, "cms_agent_tokens/k1")));
  });

  it("keeps OAuth clients, requests and codes on the server, even from the owner", async () => {
    const db = owner().firestore();
    for (const path of [
      "cms_agent_clients/cmscli_a",
      "cms_agent_requests/r1",
      "cms_agent_codes/c1",
    ]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { clientId: "mine" }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  });

  it("lets the owner read the audience counters, only the functions write them", async () => {
    const db = owner().firestore();
    await assertSucceeds(getDoc(doc(db, "cms_stats/2026-09-27-0")));
    await assertSucceeds(
      getDocs(query(collection(db, "cms_stats"), where("day", ">=", "2026-09-01"))),
    );
    await assertFails(setDoc(doc(db, "cms_stats/2026-09-27-0"), { views: 1000 }));
    await assertFails(deleteDoc(doc(db, "cms_stats/2026-09-27-0")));
  });

  for (const [who, context] of [
    ["an authenticated non-owner", intruder],
    ["an anonymous visitor", anonymous],
  ] as const) {
    it(`denies everything to ${who}`, async () => {
      const db = context().firestore();
      await assertFails(getDoc(doc(db, "cms_pages/accueil")));
      await assertFails(updateDoc(doc(db, "cms_pages/accueil"), { title: "Piraté" }));
      await assertFails(getDoc(doc(db, "cms_page_content/accueil")));
      await assertFails(setDoc(doc(db, "cms_page_content/accueil"), content));
      await assertFails(getDoc(doc(db, "cms_site/settings")));
      await assertFails(setDoc(doc(db, "cms_site/settings"), { values: {} }));
      await assertFails(getDoc(doc(db, "cms_releases/r1")));
      await assertFails(getDoc(doc(db, "cms_agent_tokens/k1")));
      await assertFails(deleteDoc(doc(db, "cms_agent_tokens/k1")));
      await assertFails(getDoc(doc(db, "cms_stats/2026-09-27-0")));
      await assertFails(setDoc(doc(db, "cms_stats/2026-09-27-9"), { views: 1 }));
      await assertFails(getDoc(doc(db, "cms_system/integrations")));
    });
  }
});

describe("Storage rules", () => {
  const png = new Uint8Array([137, 80, 78, 71]);

  it("serves media publicly, but only the owner uploads images", async () => {
    await assertSucceeds(getBytes(ref(anonymous().storage(), "cms/media/photo.png")));
    await assertSucceeds(
      uploadBytes(ref(owner().storage(), "cms/media/new.png"), png, {
        contentType: "image/png",
      }),
    );
    await assertFails(
      uploadBytes(ref(intruder().storage(), "cms/media/evil.png"), png, {
        contentType: "image/png",
      }),
    );
    await assertFails(
      uploadBytes(ref(anonymous().storage(), "cms/media/evil.png"), png, {
        contentType: "image/png",
      }),
    );
  });

  it("rejects risky file types and private paths", async () => {
    await assertFails(
      uploadBytes(ref(owner().storage(), "cms/media/x.svg"), png, {
        contentType: "image/svg+xml",
      }),
    );
    await assertFails(
      uploadBytes(ref(owner().storage(), "cms/media/x.html"), png, {
        contentType: "text/html",
      }),
    );
    await assertFails(getBytes(ref(anonymous().storage(), "cms/source/site.tgz")));
    await assertFails(getBytes(ref(owner().storage(), "cms/source/site.tgz")));
    await assertFails(
      uploadBytes(ref(owner().storage(), "cms/source/evil.tgz"), png, {
        contentType: "application/gzip",
      }),
    );
  });
});
