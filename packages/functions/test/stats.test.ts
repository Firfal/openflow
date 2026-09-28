import { FieldValue } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  normalizePath,
  type PageViewDeps,
  parseBeacon,
  recordPageView,
  VIEWS_PER_MINUTE,
  withinViewLimit,
} from "../src/stats.js";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

/** Records the writes (counters with their increments) instead of applying them. */
function recordingDb() {
  const writes: Array<{ path: string; data: Record<string, any> }> = [];
  const store = new Map<string, Record<string, any>>();
  const record = (path: string, data: Record<string, any>) => writes.push({ path, data });
  return {
    writes,
    store,
    collection: (name: string) => ({
      doc: (id: string) => ({
        path: `${name}/${id}`,
        set: async (data: Record<string, any>) => record(`${name}/${id}`, data),
      }),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (ref: { path: string }) => ({ data: () => store.get(ref.path) }),
        set: (ref: { path: string }, data: Record<string, any>) => record(ref.path, data),
      }),
  };
}

const one = FieldValue.increment(1);
const isOne = (value: unknown) => one.isEqual(value as FieldValue);

function deps(db: ReturnType<typeof recordingDb>, extra: Partial<PageViewDeps> = {}): PageViewDeps {
  return {
    db: db as never,
    livePages: async () => ({ paths: new Set(["/", "/contact/"]), host: "exemple.fr" }),
    now: new Date("2026-09-27T10:00:00Z"),
    salt: "test",
    ...extra,
  };
}

describe("page views", () => {
  it("parses beacons sent as text, and refuses large or odd ones", () => {
    expect(parseBeacon('{"p":"/"}')).toEqual({ p: "/" });
    expect(parseBeacon(Buffer.from('{"p":"/"}'))).toEqual({ p: "/" });
    expect(parseBeacon("[1]")).toBeUndefined();
    expect(parseBeacon("nope")).toBeUndefined();
    expect(parseBeacon(JSON.stringify({ p: "x".repeat(3000) }))).toBeUndefined();
  });

  it("normalises addresses like Hosting serves them", () => {
    expect(normalizePath("/contact")).toBe("/contact/");
    expect(normalizePath("/contact/index.html")).toBe("/contact/");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/actualit%C3%A9s/?a=1")).toBe("/actualités/");
  });

  it("counts a view that starts a visit: page, source, device, AI landing page", async () => {
    const db = recordingDb();
    const outcome = await recordPageView(
      { p: "/contact/", r: "https://chatgpt.com/", w: 390, e: true },
      { userAgent: BROWSER, ip: "203.0.113.1" },
      deps(db),
    );
    expect(outcome).toBe("counted");
    expect(db.writes).toHaveLength(1);
    const [write] = db.writes;
    expect(write?.path).toMatch(/^cms_stats\/2026-09-27-[0-3]$/);
    expect(write?.data.day).toBe("2026-09-27");
    expect(isOne(write?.data.views)).toBe(true);
    expect(isOne(write?.data.visits)).toBe(true);
    expect(isOne(write?.data.pages["/contact/"])).toBe(true);
    expect(isOne(write?.data.sources.chatgpt)).toBe(true);
    expect(isOne(write?.data.devices.mobile)).toBe(true);
    expect(isOne(write?.data.aiPages["/contact/"])).toBe(true);
    expect((write!.data.expiresAt as Date).toISOString().slice(0, 7)).toBe("2028-10");
  });

  it("counts a following view as a page view only, and unknown pages apart", async () => {
    const db = recordingDb();
    await recordPageView(
      { p: "/wp-login.php", r: "https://chatgpt.com/", e: false },
      { userAgent: BROWSER, ip: "203.0.113.2" },
      deps(db),
    );
    const data = db.writes[0]?.data ?? {};
    expect(Object.keys(data.pages)).toEqual(["(autre)"]);
    expect(data.visits).toBeUndefined();
    expect(data.sources).toBeUndefined();
  });

  it("keeps the referring site in the day's list of sites", async () => {
    const db = recordingDb();
    await recordPageView(
      { p: "/", r: "https://www.annuaire.fr/lyon", e: true, w: 1400 },
      { userAgent: BROWSER, ip: "203.0.113.3" },
      deps(db),
    );
    expect(db.writes.map((w) => w.path)).toEqual([
      expect.stringMatching(/^cms_stats\/2026-09-27-\d$/),
      "cms_stats/2026-09-27-sites",
    ]);
    expect(isOne(db.writes[1]?.data.sites["annuaire.fr"])).toBe(true);
  });

  it("ignores robots, invalid beacons, unpublished sites and a disabled measurement", async () => {
    const db = recordingDb();
    const request = { userAgent: BROWSER, ip: "203.0.113.4" };
    expect(
      await recordPageView({ p: "/" }, { userAgent: "Googlebot/2.1", ip: "1.1.1.1" }, deps(db)),
    ).toBe("ignored");
    expect(await recordPageView({ p: "https://x" }, request, deps(db))).toBe("ignored");
    expect(await recordPageView(undefined, request, deps(db))).toBe("ignored");
    expect(
      await recordPageView({ p: "/" }, request, deps(db, { livePages: async () => undefined })),
    ).toBe("ignored");
    expect(
      await recordPageView(
        { p: "/" },
        request,
        deps(db, { livePages: async () => ({ paths: new Set(["/"]), off: true }) }),
      ),
    ).toBe("ignored");
    expect(db.writes).toHaveLength(0);
  });

  it("counts the speed of a page load by Google's rating, not as a view", async () => {
    const db = recordingDb();
    const outcome = await recordPageView(
      { p: "/", v: { lcp: 1800, inp: 350, cls: 0.4 } },
      { userAgent: BROWSER, ip: "203.0.113.5" },
      deps(db),
    );
    expect(outcome).toBe("counted");
    const data = db.writes[0]?.data ?? {};
    expect(data.views).toBeUndefined();
    expect(isOne(data.vitals.lcp.good)).toBe(true);
    expect(isOne(data.vitals.inp.ni)).toBe(true);
    expect(isOne(data.vitals.cls.poor)).toBe(true);
    // Broken measures are dropped.
    expect(
      await recordPageView(
        { p: "/", v: { lcp: -1, cls: "x", inp: 999_999 } },
        { userAgent: BROWSER, ip: "203.0.113.6" },
        deps(db),
      ),
    ).toBe("ignored");
  });

  it("stops counting a visitor posting in a loop", () => {
    const start = 1_000_000;
    for (let i = 0; i < VIEWS_PER_MINUTE; i++) expect(withinViewLimit("v", start)).toBe(true);
    expect(withinViewLimit("v", start + 1000)).toBe(false);
    expect(withinViewLimit("v", start + 61_000)).toBe(true);
  });
});
