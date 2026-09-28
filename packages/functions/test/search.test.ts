import { describe, expect, it } from "vitest";
import { type SearchDeps, searchStats } from "../src/search.js";

function deps(properties: Array<{ siteUrl: string; permissionLevel: string }>) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const value: SearchDeps = {
    siteUrl: "https://www.atelier.fr",
    today: "2026-09-28",
    serviceAccount: async () => "123-compute@developer.gserviceaccount.com",
    request: async <T>(url: string, body?: unknown) => {
      calls.push({ url, body });
      if (url.endsWith("/sites")) return { siteEntry: properties } as T;
      const dimension = (body as { dimensions?: string[] }).dimensions?.[0];
      const rows =
        dimension === "query"
          ? [{ keys: ["boulangerie nantes"], clicks: 7, impressions: 70, ctr: 0.1, position: 3 }]
          : dimension === "page"
            ? [
                {
                  keys: ["https://www.atelier.fr/"],
                  clicks: 9,
                  impressions: 90,
                  ctr: 0.1,
                  position: 4,
                },
              ]
            : [{ clicks: 9, impressions: 90, ctr: 0.1, position: 4 }];
      return { rows } as T;
    },
  };
  return { deps: value, calls };
}

describe("Search Console", () => {
  it("reads the site's property for the period, two days behind", async () => {
    const { deps: d, calls } = deps([
      { siteUrl: "sc-domain:atelier.fr", permissionLevel: "siteRestrictedUser" },
    ]);
    const result = await searchStats(d, 28);
    expect(result).toMatchObject({
      status: "ok",
      stats: {
        property: "sc-domain:atelier.fr",
        from: "2026-08-30",
        to: "2026-09-26",
        clicks: 9,
        queries: [{ query: "boulangerie nantes" }],
        pages: [{ page: "/" }],
      },
    });
    expect(calls[1]?.url).toContain("/sites/sc-domain%3Aatelier.fr/searchAnalytics/query");
  });

  it("tells the service account to add when the property is not shared with it", async () => {
    const { deps: d } = deps([]);
    expect(await searchStats(d, 28)).toEqual({
      status: "not-connected",
      serviceAccount: "123-compute@developer.gserviceaccount.com",
      properties: 0,
    });
    expect(await searchStats({ ...d, siteUrl: undefined }, 28)).toEqual({ status: "no-url" });
  });

  it("reports an API error (Search Console API not enabled…)", async () => {
    const { deps: d } = deps([]);
    const failing: SearchDeps = {
      ...d,
      request: async () => {
        throw new Error("Search Console API has not been used in project 123");
      },
    };
    expect(await searchStats(failing, 7)).toMatchObject({ status: "error" });
  });
});
