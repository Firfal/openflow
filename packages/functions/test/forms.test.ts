import { createSnapshot, type MessageDoc } from "@openflow/core";
import { describe, expect, it } from "vitest";
import {
  findForm,
  handleSubmission,
  messageEmail,
  RATE_LIMIT,
  type SubmitDeps,
} from "../src/forms.js";

/** Minimal in-memory Firestore: enough for rate limits and messages. */
function memoryDb() {
  const store = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({ path, id: path.split("/").at(-1) });
  const db = {
    store,
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
      add: async (data: Record<string, unknown>) => {
        const id = `${name}/${store.size + 1}`;
        store.set(id, data);
        return ref(id);
      },
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (r: { path: string }) => ({ data: () => store.get(r.path) }),
        set: (r: { path: string }, data: Record<string, unknown>) => store.set(r.path, data),
        update: (r: { path: string }, data: Record<string, unknown>) =>
          store.set(r.path, { ...store.get(r.path), ...data }),
      }),
  };
  return db;
}

const snapshot = createSnapshot({
  releaseId: "r1",
  settings: { site: { name: "Site", lang: "fr" }, values: {} },
  integrations: { recaptchaSiteKey: "6Lc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  pages: [
    {
      id: "contact",
      slug: "contact",
      title: "Contact",
      status: "published",
      seo: {},
      data: {
        root: { props: {} },
        content: [
          {
            type: "ContactForm",
            props: {
              id: "form1",
              title: "Écrivez-nous",
              formFields: [
                { label: "E-mail", type: "email", required: "yes" },
                { label: "Message", type: "textarea", required: "yes" },
              ],
            },
          },
        ],
      },
    },
  ],
});

function deps(overrides: Partial<SubmitDeps> = {}) {
  const db = memoryDb();
  const logs: string[] = [];
  const mailed: MessageDoc[] = [];
  const value: SubmitDeps = {
    db: db as never,
    liveSnapshot: async () => snapshot,
    recaptchaScore: async () => 0.9,
    notify: async (message) => {
      mailed.push(message);
      return true;
    },
    log: (message) => logs.push(message),
    salt: "p",
    ...overrides,
  };
  return { value, db, logs, mailed };
}

const good = {
  formId: "form1",
  page: "/contact/",
  values: { "e-mail": "a@b.fr", message: "Bonjour" },
  elapsed: 8000,
  token: "t",
};

describe("form submissions", () => {
  it("finds the form in the published page", () => {
    expect(findForm(snapshot, "/contact", "form1")?.title).toBe("Écrivez-nous");
    expect(findForm(snapshot, "/contact/", "other")).toBeUndefined();
    expect(findForm(snapshot, "/ailleurs/", "form1")).toBeUndefined();
  });

  it("records a valid message and e-mails the owner", async () => {
    const { value, db, mailed } = deps();
    const result = await handleSubmission(good, "1.2.3.4", value);
    expect(result).toEqual({ status: 200, body: { ok: true } });
    const saved = [...db.store.entries()].find(([k]) => k.startsWith("cms_messages/"))?.[1];
    expect(saved).toMatchObject({
      formId: "form1",
      page: "/contact/",
      formTitle: "Écrivez-nous",
      email: "a@b.fr",
      read: false,
      score: 0.9,
    });
    expect(mailed).toHaveLength(1);
  });

  it("records that the visitor's AI assistant sent the form (WebMCP)", async () => {
    const { value, db } = deps();
    await handleSubmission({ ...good, agent: true }, "1.2.3.9", value);
    const saved = [...db.store.entries()].find(([k]) => k.startsWith("cms_messages/"))?.[1];
    expect(saved).toMatchObject({ agent: true });
    const other = deps();
    await handleSubmission({ ...good, agent: "yes" }, "1.2.3.10", other.value);
    const plain = [...other.db.store.entries()].find(([k]) => k.startsWith("cms_messages/"))?.[1];
    expect(plain?.agent).toBeUndefined();
  });

  it("drops bots silently: honeypot or instant sending", async () => {
    for (const body of [
      { ...good, website: "http://spam" },
      { ...good, elapsed: 300 },
    ]) {
      const { value, db } = deps();
      expect(await handleSubmission(body, "1.2.3.4", value)).toEqual({
        status: 200,
        body: { ok: true },
      });
      expect([...db.store.keys()].some((k) => k.startsWith("cms_messages/"))).toBe(false);
    }
  });

  it("keeps low reCAPTCHA scores apart, without notification", async () => {
    const { value, db, mailed } = deps({ recaptchaScore: async () => 0.1 });
    await handleSubmission(good, "1.2.3.4", value);
    const saved = [...db.store.entries()].find(([k]) => k.startsWith("cms_messages/"))?.[1];
    expect(saved).toMatchObject({ spam: true, score: 0.1 });
    expect(mailed).toHaveLength(0);
  });

  it("limits the number of messages per visitor", async () => {
    const { value } = deps();
    for (let i = 0; i < RATE_LIMIT.max; i++) {
      expect((await handleSubmission(good, "9.9.9.9", value)).status).toBe(200);
    }
    expect((await handleSubmission(good, "9.9.9.9", value)).status).toBe(429);
    expect((await handleSubmission(good, "8.8.8.8", value)).status).toBe(200);
  });

  it("rejects invalid values and unknown forms", async () => {
    const { value } = deps();
    const invalid = await handleSubmission(
      { ...good, values: { "e-mail": "x", message: "" } },
      "1.1.1.1",
      value,
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors).toEqual({
      "e-mail": "Adresse e-mail invalide.",
      message: "Ce champ est obligatoire.",
    });
    expect((await handleSubmission({ ...good, formId: "x" }, "1.1.1.2", value)).status).toBe(404);
  });

  it("logs the message for the e-mail alert when no e-mail service is configured", async () => {
    const { value, logs } = deps({ notify: async () => false });
    await handleSubmission(good, "1.2.3.5", value);
    expect(logs).toContain("CMS form submission");
  });

  it("writes an e-mail that escapes the visitor's text", () => {
    const email = messageEmail(
      {
        formId: "f",
        page: "/contact/",
        formTitle: "Contact",
        fields: [{ label: "Message", value: "<script>x</script>" }],
        createdAt: "",
        read: false,
      },
      "https://site.fr/admin/",
    );
    expect(email.html).not.toContain("<script>");
    expect(email.text).toContain("https://site.fr/admin/?view=messages");
  });
});
