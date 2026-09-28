import { describe, expect, it } from "vitest";
import {
  createSnapshot,
  sanitizeVerification,
  searchPropertyOf,
  summarizeSearch,
  verificationCode,
} from "../src/index.js";

describe("verification tags", () => {
  it("reads the code from the meta tag the owner pastes, or the code alone", () => {
    expect(
      verificationCode('<meta name="google-site-verification" content="AbC_123-xyz987654" />'),
    ).toBe("AbC_123-xyz987654");
    expect(verificationCode("  AbC_123-xyz987654 ")).toBe("AbC_123-xyz987654");
    expect(verificationCode('<script>alert("x")</script>')).toBeUndefined();
    expect(verificationCode("")).toBeUndefined();
    expect(sanitizeVerification({ google: "bad code!", bing: "0123456789ABCDEF" })).toEqual({
      bing: "0123456789ABCDEF",
    });
  });

  it("publishes the valid codes only", () => {
    const snapshot = createSnapshot({
      releaseId: "r1",
      settings: {
        site: {
          name: "Site",
          lang: "fr",
          verification: {
            google: '<meta name="google-site-verification" content="AbC_123-xyz987654" />',
            bing: "<b>",
          },
        },
        values: {},
      },
      pages: [],
    });
    expect(snapshot.site.verification).toEqual({ google: "AbC_123-xyz987654" });
  });
});

describe("search data", () => {
  it("finds the site's property: the domain first, then its address", () => {
    const properties = [
      { siteUrl: "https://autre.fr/", permissionLevel: "siteRestrictedUser" },
      { siteUrl: "https://www.atelier.fr/", permissionLevel: "siteRestrictedUser" },
      { siteUrl: "sc-domain:atelier.fr", permissionLevel: "siteRestrictedUser" },
    ];
    expect(searchPropertyOf(properties, "https://www.atelier.fr")).toBe("sc-domain:atelier.fr");
    expect(searchPropertyOf(properties.slice(0, 2), "https://www.atelier.fr")).toBe(
      "https://www.atelier.fr/",
    );
    expect(searchPropertyOf(properties, "https://ailleurs.fr")).toBeUndefined();
    expect(searchPropertyOf(properties, undefined)).toBeUndefined();
    expect(
      searchPropertyOf(
        [{ siteUrl: "sc-domain:atelier.fr", permissionLevel: "siteUnverifiedUser" }],
        "https://atelier.fr",
      ),
    ).toBeUndefined();
  });

  it("sums up the period, its queries and pages (addresses relative to the site)", () => {
    const stats = summarizeSearch(
      "sc-domain:atelier.fr",
      { from: "2026-08-29", to: "2026-09-25" },
      [{ clicks: 42, impressions: 1200, ctr: 0.035, position: 8.4321 }],
      [{ keys: ["pain au levain nantes"], clicks: 12, impressions: 90, ctr: 0.13, position: 2.46 }],
      [
        { keys: ["https://www.atelier.fr/"], clicks: 30, impressions: 800, ctr: 0.04, position: 6 },
        {
          keys: ["https://www.atelier.fr/tarifs/"],
          clicks: 5,
          impressions: 100,
          ctr: 0.05,
          position: 9,
        },
      ],
      "https://www.atelier.fr",
    );
    expect(stats).toMatchObject({ clicks: 42, impressions: 1200, ctr: 0.035, position: 8.4 });
    expect(stats.queries[0]).toEqual({
      query: "pain au levain nantes",
      clicks: 12,
      impressions: 90,
      position: 2.5,
    });
    expect(stats.pages.map((p) => p.page)).toEqual(["/", "/tarifs/"]);
  });
});
