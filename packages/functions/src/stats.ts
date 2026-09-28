import { createHash } from "node:crypto";
import {
  COLLECTIONS,
  classifySource,
  deviceOf,
  isBotAgent,
  type PageViewBeacon,
  rateVital,
  STATS_MAX_SITES,
  STATS_OTHER_PAGE,
  STATS_SHARDS,
  STATS_SOURCES,
  statsDay,
  statsExpiry,
  VITALS,
  type Vital,
} from "@openflow/core";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

/**
 * Page views of the published site (`POST /cms/view`, Hosting rewrite to `cmsPageView`), added to
 * the counters of the day (`cms_stats`). Nothing about the visitor is kept: the IP address only
 * feeds an in-memory flood limit, and the counters hold totals.
 */

/** A beacon is a few hundred bytes. */
export const MAX_BEACON_BYTES = 2048;
/** Views per visitor and minute, beyond which beacons are ignored (per instance, in memory). */
export const VIEWS_PER_MINUTE = 60;

export interface PageViewDeps {
  db: Firestore;
  /** Pages of the published site (addresses) and its host, `undefined` before a publication. */
  livePages(): Promise<{ paths: Set<string>; host?: string; off?: boolean } | undefined>;
  now?: Date;
  salt: string;
}

export type PageViewOutcome = "counted" | "ignored";

const recent = new Map<string, { start: number; count: number }>();

/** In-memory flood limit: a script posting views in a loop stops counting after a minute's share. */
export function withinViewLimit(visitor: string, now = Date.now()): boolean {
  if (recent.size > 5000) {
    for (const [key, entry] of recent) if (now - entry.start > 60_000) recent.delete(key);
  }
  const entry = recent.get(visitor);
  if (!entry || now - entry.start > 60_000) {
    recent.set(visitor, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= VIEWS_PER_MINUTE;
}

/** Parses the body of a beacon (sent as `text/plain` to avoid a CORS preflight). */
export function parseBeacon(raw: unknown): PageViewBeacon | undefined {
  try {
    const text =
      typeof raw === "string"
        ? raw
        : Buffer.isBuffer(raw)
          ? raw.toString("utf8")
          : JSON.stringify(raw ?? null);
    if (text.length > MAX_BEACON_BYTES) return undefined;
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as PageViewBeacon)
      : undefined;
  } catch {
    return undefined;
  }
}

/** The page's address as published: `/contact` and `/contact/index.html` are `/contact/`. */
export function normalizePath(path: string): string {
  let clean = path.split(/[?#]/)[0] ?? "/";
  clean = clean.replace(/\/index\.html?$/, "/").replace(/\.html?$/, "");
  if (!clean.startsWith("/")) clean = `/${clean}`;
  if (!clean.endsWith("/")) clean = `${clean}/`;
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

/** Adds one page view to the counters; bots, invalid beacons and floods are ignored. */
export async function recordPageView(
  beacon: PageViewBeacon | undefined,
  request: { userAgent?: string; ip: string },
  deps: PageViewDeps,
): Promise<PageViewOutcome> {
  if (!beacon || typeof beacon.p !== "string" || !beacon.p.startsWith("/")) return "ignored";
  if (isBotAgent(request.userAgent)) return "ignored";
  const visitor = createHash("sha256").update(`${deps.salt}:${request.ip}`).digest("hex");
  if (!withinViewLimit(visitor)) return "ignored";
  const site = await deps.livePages();
  if (!site || site.off) return "ignored";
  if (beacon.v !== undefined) return recordVitals(beacon.v, deps);
  const path = normalizePath(beacon.p.slice(0, 300));
  const page = site.paths.has(path) ? path : STATS_OTHER_PAGE;
  const now = deps.now ?? new Date();
  const day = statsDay(now);
  const increment = FieldValue.increment(1);
  const counters: Record<string, unknown> = {
    day,
    expiresAt: statsExpiry(day),
    views: increment,
    pages: { [page]: increment },
  };
  const entry = beacon.e === true;
  let host: string | undefined;
  if (entry) {
    const source = classifySource({
      referrer: typeof beacon.r === "string" ? beacon.r.slice(0, 500) : undefined,
      utmSource: typeof beacon.u === "string" ? beacon.u.slice(0, 100) : undefined,
      siteHost: site.host,
    });
    host = source.host;
    counters.visits = increment;
    counters.sources = { [source.source]: increment };
    counters.devices = { [deviceOf(Number(beacon.w))]: increment };
    if (STATS_SOURCES[source.source]?.group === "ai") counters.aiPages = { [page]: increment };
  }
  const stats = deps.db.collection(COLLECTIONS.stats);
  const shard = Math.floor(Math.random() * STATS_SHARDS);
  await stats.doc(`${day}-${shard}`).set(counters, { merge: true });
  if (host) await countSite(deps.db, day, host);
  return "counted";
}

/** Largest plausible values: anything beyond is a broken measure, not a slow page. */
const VITAL_LIMITS: Record<Vital, number> = { lcp: 120_000, inp: 60_000, cls: 50 };

/**
 * Adds the Core Web Vitals of one page load to the day's counters, by Google's rating
 * (good, needs improvement, poor). Only the ratings are kept.
 */
async function recordVitals(value: unknown, deps: PageViewDeps): Promise<PageViewOutcome> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "ignored";
  const increment = FieldValue.increment(1);
  const vitals: Record<string, Record<string, FieldValue>> = {};
  for (const key of Object.keys(VITALS) as Vital[]) {
    const measure = (value as Record<string, unknown>)[key];
    if (typeof measure !== "number" || !Number.isFinite(measure)) continue;
    if (measure < 0 || measure > VITAL_LIMITS[key]) continue;
    vitals[key] = { [rateVital(key, measure)]: increment };
  }
  if (Object.keys(vitals).length === 0) return "ignored";
  const day = statsDay(deps.now ?? new Date());
  const shard = Math.floor(Math.random() * STATS_SHARDS);
  await deps.db
    .collection(COLLECTIONS.stats)
    .doc(`${day}-${shard}`)
    .set({ day, expiresAt: statsExpiry(day), vitals }, { merge: true });
  return "counted";
}

/** Counts a referring site, up to {@link STATS_MAX_SITES} a day (then « autres »). */
async function countSite(db: Firestore, day: string, host: string): Promise<void> {
  const ref = db.collection(COLLECTIONS.stats).doc(`${day}-sites`);
  await db.runTransaction(async (tx) => {
    const sites = ((await tx.get(ref)).data()?.sites ?? {}) as Record<string, number>;
    const key = host in sites || Object.keys(sites).length < STATS_MAX_SITES ? host : "autres";
    tx.set(
      ref,
      { day, expiresAt: statsExpiry(day), sites: { [key]: FieldValue.increment(1) } },
      { merge: true },
    );
  });
}
