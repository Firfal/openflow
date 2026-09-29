/**
 * Google Search Console. The owner proves the site is theirs with the meta tag Search Console gives
 * (« Site et référencement »), then adds the site's service account as a user of the
 * property: `cmsSearchStats` reads the searches that show the site (clicks, impressions, position,
 * queries, pages) with it, and the admin shows them in « Statistiques ». Bing Webmaster Tools, which
 * imports Search Console, takes its own tag too.
 */

/** Meta tags proving the site to the search engines' tools (`site.verification`). */
export interface SearchVerification {
  /** `google-site-verification` (Search Console). */
  google?: string;
  /** `msvalidate.01` (Bing Webmaster Tools). */
  bing?: string;
}

const CODE = /^[\w-]{10,100}$/;

/**
 * The code of a verification tag, from what the owner pasted: the whole meta tag or the code alone.
 * `undefined` when it is neither.
 */
export function verificationCode(input: string | undefined): string | undefined {
  const text = (input ?? "").trim();
  if (!text) return undefined;
  const content = /content\s*=\s*["']([^"']+)["']/i.exec(text)?.[1] ?? text;
  return CODE.test(content.trim()) ? content.trim() : undefined;
}

/** The valid codes only (for the snapshot and the page's `<head>`). */
export function sanitizeVerification(
  value: SearchVerification | undefined,
): SearchVerification | undefined {
  const google = verificationCode(value?.google);
  const bing = verificationCode(value?.bing);
  if (!google && !bing) return undefined;
  return { ...(google ? { google } : {}), ...(bing ? { bing } : {}) };
}

// ---------------------------------------------------------------------------------------------
// Search data

/** A Search Console property the service account can read. */
export interface SearchProperty {
  siteUrl: string;
  permissionLevel?: string;
}

/**
 * The property of the site among those the service account can read: the domain property
 * (`sc-domain:example.fr`) first, then the address of the site (`https://www.example.fr/`).
 */
export function searchPropertyOf(
  properties: SearchProperty[],
  siteUrl: string | undefined,
): string | undefined {
  if (!siteUrl) return undefined;
  let host: string;
  try {
    host = new URL(siteUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  const readable = properties.filter((p) => p.permissionLevel !== "siteUnverifiedUser");
  const bare = host.replace(/^www\./, "");
  const domain = readable.find((p) => {
    const match = /^sc-domain:(.+)$/.exec(p.siteUrl);
    return match && (host === match[1] || host.endsWith(`.${match[1]}`) || bare === match[1]);
  });
  if (domain) return domain.siteUrl;
  return readable.find((p) => {
    try {
      return new URL(p.siteUrl).hostname.toLowerCase() === host;
    } catch {
      return false;
    }
  })?.siteUrl;
}

/** One line of the Search Analytics API (`searchanalytics.query`). */
export interface SearchRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchStats {
  property: string;
  /** Days covered (`YYYY-MM-DD`): Search Console has the data of two or three days ago at most. */
  from: string;
  to: string;
  clicks: number;
  impressions: number;
  /** Clicks per impression (0 to 1). */
  ctr: number;
  /** Average position in the results (1 = first). */
  position: number;
  queries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
  pages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** The request body of one Search Analytics query (`dimension` groups the lines). */
export function searchQuery(
  from: string,
  to: string,
  dimension?: "query" | "page",
  rowLimit = 10,
): Record<string, unknown> {
  return {
    startDate: from,
    endDate: to,
    ...(dimension ? { dimensions: [dimension], rowLimit } : {}),
    dataState: "final",
  };
}

/** The period's totals, its main queries and pages, from the three API answers. */
export function summarizeSearch(
  property: string,
  period: { from: string; to: string },
  totals: SearchRow[],
  queries: SearchRow[],
  pages: SearchRow[],
  siteUrl?: string,
): SearchStats {
  const total = totals[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const origin = siteUrl ? siteUrl.replace(/\/$/, "") : "";
  return {
    property,
    from: period.from,
    to: period.to,
    clicks: total.clicks,
    impressions: total.impressions,
    ctr: round(total.ctr, 4),
    position: round(total.position, 1),
    queries: queries.map((row) => ({
      query: row.keys?.[0] ?? "",
      clicks: row.clicks,
      impressions: row.impressions,
      position: round(row.position, 1),
    })),
    pages: pages.map((row) => {
      const url = row.keys?.[0] ?? "";
      return {
        page: origin && url.startsWith(origin) ? url.slice(origin.length) || "/" : url,
        clicks: row.clicks,
        impressions: row.impressions,
        position: round(row.position, 1),
      };
    }),
  };
}

/** What `cmsSearchStats` answers. */
export type SearchStatsResult =
  | { status: "ok"; stats: SearchStats }
  /** The site's address is not filled in (« Site et référencement »). */
  | { status: "no-url" }
  /** The service account cannot read the site's property yet: the owner adds it as a user. */
  | { status: "not-connected"; serviceAccount?: string; properties: number }
  | { status: "error"; message: string };
