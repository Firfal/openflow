import { describe, expect, it } from "vitest";
import {
  addDays,
  classifySource,
  deviceOf,
  isBotAgent,
  STATS_OTHER_PAGE,
  statsDay,
  statsExpiry,
  statsPeriod,
  summarizeStats,
} from "../src/index.js";

describe("classifySource", () => {
  it("names the AI assistants, by referrer or utm_source", () => {
    expect(classifySource({ referrer: "https://chatgpt.com/" }).source).toBe("chatgpt");
    expect(classifySource({ utmSource: "chatgpt.com" }).source).toBe("chatgpt");
    expect(classifySource({ referrer: "https://www.perplexity.ai/search?q=x" }).source).toBe(
      "perplexity",
    );
    expect(classifySource({ referrer: "https://claude.ai/" }).source).toBe("claude");
    expect(classifySource({ referrer: "https://gemini.google.com/" }).source).toBe("gemini");
    expect(classifySource({ referrer: "https://copilot.microsoft.com/" }).source).toBe("copilot");
  });

  it("tells search engines and social networks apart", () => {
    expect(classifySource({ referrer: "https://www.google.fr/" }).source).toBe("google");
    expect(classifySource({ referrer: "https://www.google.co.uk/" }).source).toBe("google");
    expect(
      classifySource({ referrer: "android-app://com.google.android.googlequicksearchbox/" }).source,
    ).toBe("google");
    expect(classifySource({ referrer: "https://www.bing.com/" }).source).toBe("bing");
    expect(classifySource({ referrer: "https://www.qwant.com/" }).source).toBe("qwant");
    expect(classifySource({ referrer: "https://l.facebook.com/" }).source).toBe("facebook");
    expect(classifySource({ referrer: "https://t.co/abc" }).source).toBe("x");
  });

  it("keeps other sites by host, and the site itself as direct", () => {
    expect(classifySource({ referrer: "https://www.annuaire-artisans.fr/lyon" })).toEqual({
      source: "site",
      host: "annuaire-artisans.fr",
    });
    expect(classifySource({ utmSource: "newsletter" })).toEqual({
      source: "site",
      host: "newsletter",
    });
    expect(classifySource({ referrer: "https://www.exemple.fr/", siteHost: "exemple.fr" })).toEqual(
      { source: "direct" },
    );
    expect(classifySource({})).toEqual({ source: "direct" });
    expect(classifySource({ referrer: "pas une adresse" })).toEqual({ source: "direct" });
    expect(classifySource({ utmSource: "<script>" })).toEqual({ source: "direct" });
  });
});

describe("devices, robots and days", () => {
  it("guesses the device from the window width", () => {
    expect(deviceOf(390)).toBe("mobile");
    expect(deviceOf(900)).toBe("tablet");
    expect(deviceOf(1440)).toBe("desktop");
    expect(deviceOf(Number.NaN)).toBe("mobile");
  });

  it("recognises robots and automated browsers", () => {
    expect(isBotAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"));
    expect(
      isBotAgent("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140"),
    ).toBe(true);
    expect(isBotAgent("curl/8.5.0")).toBe(true);
    expect(isBotAgent(undefined)).toBe(true);
    expect(
      isBotAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(isBotAgent("Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36")).toBe(false);
  });

  it("counts days in the site's time", () => {
    // 23:30 UTC on 27 September is already the 28th in Paris.
    expect(statsDay(new Date("2026-09-27T23:30:00Z"))).toBe("2026-09-28");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(statsExpiry("2026-09-28").toISOString().slice(0, 10)).toBe("2028-10-28");
    expect(statsPeriod(7, "2026-09-28")).toEqual({ from: "2026-09-22", to: "2026-09-28" });
  });
});

describe("summarizeStats", () => {
  it("adds up shards and days, and ranks pages and sources", () => {
    const summary = summarizeStats(
      [
        {
          day: "2026-09-27",
          views: 5,
          visits: 3,
          pages: { "/": 3, "/contact/": 2 },
          sources: { chatgpt: 1, google: 2 },
          devices: { mobile: 2, desktop: 1 },
          aiPages: { "/contact/": 1 },
        },
        {
          day: "2026-09-27",
          views: 2,
          visits: 1,
          pages: { "/": 1, [STATS_OTHER_PAGE]: 1 },
          sources: { direct: 1 },
          devices: { mobile: 1 },
        },
        { day: "2026-09-26", sites: { "annuaire.fr": 2 } },
        { day: "2026-08-01", views: 100 },
      ],
      { from: "2026-09-26", to: "2026-09-28" },
      (path) => (path === "/" ? "Accueil" : path),
    );
    expect(summary.views).toBe(7);
    expect(summary.visits).toBe(4);
    expect(summary.aiVisits).toBe(1);
    expect(summary.days.map((d) => d.day)).toEqual(["2026-09-26", "2026-09-27", "2026-09-28"]);
    expect(summary.days[1]).toEqual({ day: "2026-09-27", views: 7, visits: 4, ai: 1 });
    expect(summary.pages[0]).toEqual({ key: "/", label: "Accueil", count: 4 });
    expect(summary.pages.at(-1)?.label).toBe("Autres adresses");
    expect(summary.sources[0]).toMatchObject({ key: "google", label: "Google", group: "search" });
    // Equal counts: by name (« Accès direct » before « Assistants IA »).
    expect(summary.groups.map((g) => g.key)).toEqual(["search", "direct", "ai"]);
    expect(summary.aiPages).toEqual([{ key: "/contact/", label: "/contact/", count: 1 }]);
    expect(summary.devices[0]).toEqual({ key: "mobile", label: "Mobile", count: 3 });
    expect(summary.sites).toEqual([{ key: "annuaire.fr", label: "annuaire.fr", count: 2 }]);
  });
});
