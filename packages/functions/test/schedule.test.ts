import { createSnapshot, type ReleaseDoc, SCHEDULE_AUTHOR, type Snapshot } from "@openflow/core";
import { describe, expect, it } from "vitest";
import { publishScheduled, type ScheduleStore } from "../src/schedule.js";

const NOW = "2026-10-01T07:00:00.000Z";

const text = (id: string) => ({
  root: { props: {} },
  content: [{ type: "Text", props: { id, title: id } }],
});

const live: ReleaseDoc = {
  status: "live",
  createdAt: "2026-09-01T08:00:00.000Z",
  createdBy: "proprietaire@exemple.fr",
  snapshotPath: "cms/snapshots/r1.json",
  sourcePath: "cms/sources/site.tgz",
  builder: "cloud-build",
  pageCount: 1,
};

const snapshot = createSnapshot({
  releaseId: "r1",
  settings: { site: { name: "Atelier", lang: "fr" }, values: {} },
  pages: [
    { id: "accueil", slug: "", title: "Accueil", status: "published", seo: {}, data: text("a") },
  ],
});

function store(options: { running?: boolean; live?: ReleaseDoc; fail?: boolean } = {}) {
  const calls = {
    released: [] as Array<{ id: string; snapshot: Snapshot; release: Partial<ReleaseDoc> }>,
    published: [] as string[][],
  };
  const impl: ScheduleStore = {
    scheduledPages: async () => [
      { id: "promo", publishAt: "2026-10-01T09:00:00+02:00" },
      { id: "plus-tard", publishAt: "2026-10-02T07:00:00.000Z" },
    ],
    running: async () => options.running ?? false,
    liveRelease: async () => ("live" in options ? options.live : live),
    loadSnapshot: async () => snapshot,
    loadPages: async (ids) =>
      ids.map((id) => ({ id, slug: "promo-hiver", title: "Promo", seo: {}, data: text(id) })),
    newReleaseId: () => "r2",
    release: async (id, next, release) => {
      if (options.fail) throw new Error("Cloud Build indisponible");
      calls.released.push({ id, snapshot: next, release });
    },
    markPublished: async (ids) => {
      calls.published.push(ids);
    },
  };
  return { impl, calls };
}

describe("scheduled publication", () => {
  it("adds the due pages to the online site, and only them", async () => {
    const { impl, calls } = store();
    expect(await publishScheduled(impl, NOW)).toEqual({
      done: "published",
      pages: ["promo"],
      releaseId: "r2",
    });
    const [released] = calls.released;
    expect(released?.snapshot.pages.map((p) => p.slug)).toEqual(["", "promo-hiver"]);
    expect(released?.release).toMatchObject({
      createdBy: SCHEDULE_AUTHOR,
      createdAt: NOW,
      sourcePath: live.sourcePath,
      builder: "cloud-build",
      // The other pages stay online as they were published.
      contentAt: live.createdAt,
      scheduledPages: ["promo"],
    });
    expect(calls.published).toEqual([["promo"]]);
  });

  it("waits for a running publication", async () => {
    const { impl, calls } = store({ running: true });
    expect(await publishScheduled(impl, NOW)).toEqual({ done: "wait", pages: ["promo"] });
    expect(calls.published).toEqual([]);
  });

  it("makes the pages visible when the site was never published", async () => {
    const { impl, calls } = store({ live: undefined });
    expect(await publishScheduled(impl, NOW)).toEqual({ done: "visible", pages: ["promo"] });
    expect(calls.released).toEqual([]);
    expect(calls.published).toEqual([["promo"]]);
  });

  it("never retries a failed start every quarter of an hour", async () => {
    const { impl, calls } = store({ fail: true });
    expect(await publishScheduled(impl, NOW)).toEqual({
      done: "failed",
      pages: ["promo"],
      error: "Cloud Build indisponible",
    });
    // Visible: the page goes online with the next publication.
    expect(calls.published).toEqual([["promo"]]);
  });

  it("does nothing before the time", async () => {
    const { impl, calls } = store();
    expect(await publishScheduled(impl, "2026-10-01T06:59:00.000Z")).toEqual({ done: "nothing" });
    expect(calls.published).toEqual([]);
  });
});
