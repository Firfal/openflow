import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
  addPagesToSnapshot,
  createSnapshot,
  duePages,
  isValidPublishAt,
  pageChanged,
  pageOnlineAt,
} from "../src/index.js";

const text = (id: string, link?: string): Data =>
  ({
    root: { props: {} },
    content: [
      {
        type: "Text",
        props: {
          id,
          title: id,
          ...(link ? { cta: { kind: "page", pageId: link, href: "/old/" } } : {}),
        },
      },
    ],
  }) as Data;

const live = createSnapshot({
  releaseId: "r1",
  createdAt: "2026-09-01T08:00:00Z",
  settings: {
    site: { name: "Atelier", lang: "fr", locales: ["en"] },
    values: { footer: "Fait main" },
    translations: { en: { values: { footer: "Handmade" } } },
  },
  pages: [
    {
      id: "accueil",
      slug: "",
      title: "Accueil",
      status: "published",
      seo: {},
      data: text("home", "promo"),
      translations: { en: { title: "Home", values: {} } },
    },
  ],
});

describe("scheduled publication", () => {
  it("adds the page to the online site, and only it", () => {
    const next = addPagesToSnapshot(
      live,
      [
        {
          id: "promo",
          slug: "promo-hiver",
          title: "Promo d'hiver",
          seo: { description: "Deux pains achetés, le troisième offert." },
          data: text("promo"),
          updatedAt: "2026-09-20T10:00:00Z",
        },
      ],
      { releaseId: "r2", createdAt: "2026-10-01T07:00:00Z" },
    );
    expect(next.releaseId).toBe("r2");
    expect(next.pages.map((p) => p.slug)).toEqual(["", "promo-hiver"]);
    // The online page's link now leads to the new page.
    const home = next.pages[0]!.data.content[0]!.props as Record<string, any>;
    expect(home.cta.href).toBe("/promo-hiver/");
    // The rest of the online site is kept: languages, common content and its translation.
    expect(next.site.locales).toEqual(["en"]);
    expect(next.settings).toEqual({ footer: "Fait main" });
    expect(next.settingsTranslations).toEqual({ en: { values: { footer: "Handmade" } } });
    expect(next.pages[0]!.translations).toEqual({ en: { title: "Home", values: {} } });
  });

  it("accepts a time in the future with its time zone, less than a year away", () => {
    const now = Date.parse("2026-09-28T10:00:00Z");
    expect(isValidPublishAt("2026-10-01T07:00:00.000Z", now)).toBe(true);
    expect(isValidPublishAt("2026-10-01T09:00+02:00", now)).toBe(true);
    // Without a time zone, the hour is ambiguous.
    expect(isValidPublishAt("2026-10-01T09:00", now)).toBe(false);
    expect(isValidPublishAt("2026-09-28T09:00:00Z", now)).toBe(false);
    expect(isValidPublishAt("2028-01-01T00:00:00Z", now)).toBe(false);
    expect(isValidPublishAt("demain", now)).toBe(false);
    expect(
      duePages(
        [
          { id: "b", publishAt: "2026-09-28T09:45:00Z" },
          { id: "later", publishAt: "2026-09-28T10:15:00Z" },
          { id: "none" },
          { id: "a", publishAt: "2026-09-28T11:00:00+02:00" },
        ],
        "2026-09-28T10:00:00Z",
      ).map((p: { id: string }) => p.id),
    ).toEqual(["a", "b"]);
  });

  it("knows when a page went online, with the site or on its own", () => {
    const full = { status: "superseded" as const, createdAt: "2026-09-01T08:00:00Z" };
    const scheduled = {
      status: "live" as const,
      createdAt: "2026-10-01T07:00:00Z",
      contentAt: "2026-09-01T08:00:00Z",
      scheduledPages: ["promo"],
    };
    const releases = [scheduled, full];
    expect(pageOnlineAt("accueil", releases)).toBe("2026-09-01T08:00:00Z");
    expect(pageOnlineAt("promo", releases)).toBe("2026-10-01T07:00:00Z");
    // Edited before its scheduled time: online as it is; edited after: to publish.
    expect(pageChanged({ id: "promo", updatedAt: "2026-09-20T10:00:00Z" }, releases)).toBe(false);
    expect(pageChanged({ id: "promo", updatedAt: "2026-10-02T10:00:00Z" }, releases)).toBe(true);
    expect(pageChanged({ id: "accueil", updatedAt: "2026-09-20T10:00:00Z" }, releases)).toBe(true);
    // A failed scheduled publication did not put the page online.
    expect(
      pageOnlineAt("promo", [
        { ...scheduled, status: "failed" },
        { ...full, status: "live" },
      ]),
    ).toBe("2026-09-01T08:00:00Z");
    expect(pageChanged({ id: "promo", updatedAt: "2026-08-01T00:00:00Z" }, [])).toBe(true);
  });
});
