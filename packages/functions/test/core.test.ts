import { createSnapshot } from "@openflow/core";
import { describe, expect, it } from "vitest";
import {
  buildRequest,
  formerOwners,
  isOwnerToken,
  notifyIndexNow,
  ownerDecision,
  parseOwners,
  releaseStatusFromBuild,
  snapshotPath,
} from "../src/core.js";

describe("owner", () => {
  it("parses owner emails", () => {
    expect(parseOwners(" Client@Exemple.fr, autre@x.fr;b@y.fr ")).toEqual([
      "client@exemple.fr",
      "autre@x.fr",
      "b@y.fr",
    ]);
    expect(parseOwners(undefined)).toEqual([]);
  });

  it("finds the accounts that kept the claim after an owner change", () => {
    const users = [
      { email: "ancien@exemple.fr", customClaims: { cms_owner: true, autre: 1 } },
      { email: "Nouveau@exemple.fr", customClaims: { cms_owner: true } },
      { email: "visiteur@exemple.fr" },
    ];
    expect(formerOwners(users, ["nouveau@exemple.fr"]).map((u) => u.email)).toEqual([
      "ancien@exemple.fr",
    ]);
    // No owner configured: nothing is revoked (the functions refuse everyone anyway).
    expect(formerOwners(users, [])).toEqual([]);
  });

  it("only accepts the configured, verified email", () => {
    const owners = ["client@exemple.fr"];
    expect(
      ownerDecision({ email: "CLIENT@exemple.fr", email_verified: true }, owners, false),
    ).toEqual({ ok: true });
    expect(
      ownerDecision({ email: "pirate@x.fr", email_verified: true }, owners, false),
    ).toMatchObject({ ok: false, code: "permission-denied" });
    expect(
      ownerDecision({ email: "client@exemple.fr", email_verified: false }, owners, false),
    ).toMatchObject({ ok: false, code: "permission-denied" });
    expect(
      ownerDecision({ email: "client@exemple.fr", email_verified: false }, owners, true),
    ).toEqual({ ok: true });
    expect(
      ownerDecision({ email: "client@exemple.fr", email_verified: true }, [], false),
    ).toMatchObject({ ok: false, code: "failed-precondition" });
  });

  it("requires the claim and a still-configured email", () => {
    expect(isOwnerToken({ email: "a@x.fr", cms_owner: true }, ["a@x.fr"])).toBe(true);
    expect(isOwnerToken({ email: "a@x.fr" }, ["a@x.fr"])).toBe(false);
    expect(isOwnerToken({ email: "old@x.fr", cms_owner: true }, ["new@x.fr"])).toBe(false);
    expect(isOwnerToken(undefined, ["a@x.fr"])).toBe(false);
  });
});

describe("cloud build", () => {
  it("builds from the source archive with the frozen snapshot, then deploys hosting", () => {
    const request = buildRequest({
      projectId: "mon-site",
      bucket: "mon-site.firebasestorage.app",
      sourcePath: "cms/source/abc.tgz",
      snapshotPath: snapshotPath("R1"),
      releaseId: "R1",
      serviceAccount: "cms-builder@mon-site.iam.gserviceaccount.com",
    });
    expect(request.source.storageSource).toEqual({
      bucket: "mon-site.firebasestorage.app",
      object: "cms/source/abc.tgz",
    });
    expect(request.steps.map((step) => step.id)).toEqual([
      "snapshot",
      "install",
      "build",
      "deploy",
    ]);
    expect(request.steps[0]!.args).toContain(
      "gs://mon-site.firebasestorage.app/cms/snapshots/R1.json",
    );
    expect(request.steps[2]!.env).toContain("CMS_SNAPSHOT=openflow/.snapshot.json");
    expect(request.steps[3]!.args).toEqual(
      expect.arrayContaining(["deploy", "--only", "hosting", "--project", "mon-site"]),
    );
    expect(request.substitutions).toEqual({ _CMS_RELEASE_ID: "R1" });
    // Cloud Build rejects a substitution no step uses, unless the option is loose.
    expect(request.options.substitutionOption).toBe("ALLOW_LOOSE");
    expect(request.serviceAccount).toBe(
      "projects/mon-site/serviceAccounts/cms-builder@mon-site.iam.gserviceaccount.com",
    );
  });

  it("maps Cloud Build statuses to release statuses", () => {
    expect(releaseStatusFromBuild({ status: "QUEUED" })).toBe("queued");
    expect(releaseStatusFromBuild({ status: "WORKING" })).toBe("building");
    expect(releaseStatusFromBuild({ status: "SUCCESS" })).toBe("live");
    expect(releaseStatusFromBuild({ status: "TIMEOUT" })).toBe("failed");
    expect(releaseStatusFromBuild({ status: "STATUS_UNKNOWN" })).toBeUndefined();
  });
});

describe("IndexNow", () => {
  const snapshot = (url?: string, key = "0123456789abcdef0123456789abcdef") =>
    createSnapshot({
      releaseId: "r2",
      integrations: { indexNowKey: key },
      settings: { site: { name: "Pain", lang: "fr", ...(url ? { url } : {}) }, values: {} },
      pages: [
        {
          id: "a",
          slug: "",
          title: "Accueil",
          status: "published",
          seo: {},
          data: { root: { props: {} }, content: [] },
          updatedAt: "2026-09-01T10:00:00.000Z",
        },
        {
          id: "b",
          slug: "tarifs",
          title: "Tarifs",
          status: "published",
          seo: {},
          data: { root: { props: {} }, content: [] },
          updatedAt: "2026-09-20T10:00:00.000Z",
        },
        {
          id: "c",
          slug: "cache",
          title: "Cachée",
          status: "published",
          seo: { noindex: true },
          data: { root: { props: {} }, content: [] },
          updatedAt: "2026-09-20T10:00:00.000Z",
        },
      ],
    });

  it("sends the pages changed since the last publication, once the site serves its key", async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      if (url.endsWith("/indexnow.txt")) return new Response("0123456789abcdef0123456789abcdef");
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    const result = await notifyIndexNow(
      snapshot("https://pain.fr"),
      "2026-09-10T00:00:00.000Z",
      fake,
    );
    expect(result).toEqual({ sent: 1 });
    const body = JSON.parse(calls[1]!.body!);
    expect(calls[1]!.url).toBe("https://api.indexnow.org/indexnow");
    expect(body).toEqual({
      host: "pain.fr",
      key: "0123456789abcdef0123456789abcdef",
      keyLocation: "https://pain.fr/indexnow.txt",
      urlList: ["https://pain.fr/tarifs/"],
    });
  });

  it("skips without an address, or when the key is not served", async () => {
    const notServed = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    expect(await notifyIndexNow(snapshot(), undefined, notServed)).toEqual({
      skipped: "adresse du site inconnue",
    });
    expect(await notifyIndexNow(snapshot("https://pain.fr"), undefined, notServed)).toEqual({
      skipped: "clé non servie par le site",
    });
  });
});
