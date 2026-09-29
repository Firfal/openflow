import {
  addDays,
  type SearchProperty,
  type SearchRow,
  type SearchStatsResult,
  searchPropertyOf,
  searchQuery,
  summarizeSearch,
} from "@openflow/core";

/**
 * Google Search Console, read with the service account of the site's functions: the owner adds
 * its e-mail as a user of the site's property (« Restreint » is enough). Nothing is stored: the
 * admin and the AI assistant ask for a period, and get the searches that showed the site.
 */

const API = "https://searchconsole.googleapis.com/webmasters/v3";

export interface SearchDeps {
  /** An authorized call to a Google API (GET without body, POST with one). */
  request<T>(url: string, body?: unknown): Promise<T>;
  /** E-mail of the service account the owner adds in Search Console. */
  serviceAccount(): Promise<string | undefined>;
  /** The site's address (« Site et référencement »). */
  siteUrl: string | undefined;
  /** `YYYY-MM-DD`. */
  today: string;
}

/** Search Console's figures of the last `days` days (its data lags two days behind). */
export async function searchStats(deps: SearchDeps, days: number): Promise<SearchStatsResult> {
  if (!deps.siteUrl) return { status: "no-url" };
  let properties: SearchProperty[];
  try {
    properties =
      (await deps.request<{ siteEntry?: SearchProperty[] }>(`${API}/sites`)).siteEntry ?? [];
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }
  const property = searchPropertyOf(properties, deps.siteUrl);
  if (!property) {
    return {
      status: "not-connected",
      serviceAccount: await deps.serviceAccount().catch(() => undefined),
      properties: properties.length,
    };
  }
  const to = addDays(deps.today, -2);
  const from = addDays(to, -(days - 1));
  const url = `${API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  try {
    const [totals, queries, pages] = await Promise.all(
      [searchQuery(from, to), searchQuery(from, to, "query"), searchQuery(from, to, "page")].map(
        (body) => deps.request<{ rows?: SearchRow[] }>(url, body),
      ),
    );
    return {
      status: "ok",
      stats: summarizeSearch(
        property,
        { from, to },
        totals?.rows ?? [],
        queries?.rows ?? [],
        pages?.rows ?? [],
        deps.siteUrl,
      ),
    };
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }
}
