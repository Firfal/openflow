import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
  applyPageTranslation,
  applySettingsTranslation,
  collectTranslation,
  createSnapshot,
  defineConfig,
  formatClosure,
  formatOpeningHours,
  imageField,
  languageLinks,
  linkField,
  localizeSnapshot,
  pageAtPath,
  pageTexts,
  publishedPaths,
  SnapshotError,
  settingsTexts,
  siteLocales,
  siteVersions,
  textFingerprint,
  translationStatus,
} from "../src/index.js";

const config = defineConfig({
  site: { name: "Atelier", lang: "fr" },
  components: {
    Hero: {
      label: "En-tête",
      fields: {
        title: { type: "text", label: "Titre", contentEditable: true },
        body: { type: "richtext", label: "Texte" },
        image: imageField({ label: "Image" }),
        cta: linkField({ label: "Bouton" }),
        tone: { type: "radio", label: "Fond", options: [{ label: "Clair", value: "light" }] },
        items: {
          type: "array",
          label: "Questions",
          arrayFields: {
            question: { type: "text", label: "Question" },
            answer: { type: "textarea", label: "Réponse" },
          },
        },
      },
      defaultProps: { title: "", body: "", image: null, cta: null, tone: "light", items: [] },
      render: () => null as never,
    },
  },
  settings: {
    fields: {
      footerText: { type: "textarea", label: "Pied de page" },
      navigation: {
        type: "array",
        label: "Menu",
        arrayFields: { label: { type: "text", label: "Libellé" }, link: linkField() },
      },
    },
    defaultProps: { footerText: "", navigation: [] },
  },
});

const hero = (id: string): Data =>
  ({
    root: { props: {} },
    content: [
      {
        type: "Hero",
        props: {
          id,
          title: "Bienvenue à l'atelier",
          body: "<p>Du pain au levain.</p>",
          image: { src: "/images/four.webp", alt: "Le four à bois" },
          cta: { kind: "page", pageId: "contact", href: "/contact/" },
          tone: "light",
          items: [{ question: "Ouvert le dimanche ?", answer: "Non, fermé." }],
        },
      },
    ],
  }) as Data;

describe("translatable texts", () => {
  it("lists the texts of a page, never its links, images or styles", () => {
    expect(pageTexts(hero("h"), config).map((t) => [t.key, t.kind, t.label])).toEqual([
      ["h/title", "text", "En-tête › Titre"],
      ["h/body", "richtext", "En-tête › Texte"],
      ["h/image.alt", "alt", "En-tête › Image (description)"],
      ["h/items[0].question", "text", "En-tête › Questions 1 › Question"],
      ["h/items[0].answer", "textarea", "En-tête › Questions 1 › Réponse"],
    ]);
    expect(
      settingsTexts({ footerText: "Fait main", navigation: [{ label: "Accueil" }] }, config).map(
        (t) => t.key,
      ),
    ).toEqual(["footerText", "navigation[0].label"]);
  });

  it("applies a translation to the texts only", () => {
    const english = applyPageTranslation(hero("h"), config, {
      "h/title": "Welcome to the workshop",
      "h/image.alt": "The wood oven",
      "h/items[0].answer": "No, closed.",
      // Not a text: ignored.
      "h/cta.href": "https://evil.example",
      "h/tone": "dark",
      "other/title": "?",
    });
    const props = english.content[0]!.props as Record<string, any>;
    expect(props.title).toBe("Welcome to the workshop");
    expect(props.image).toEqual({ src: "/images/four.webp", alt: "The wood oven" });
    expect(props.items[0]).toEqual({ question: "Ouvert le dimanche ?", answer: "No, closed." });
    expect(props.cta.href).toBe("/contact/");
    expect(props.tone).toBe("light");
    // The source is untouched.
    expect((hero("h").content[0]!.props as Record<string, any>).title).toBe(
      "Bienvenue à l'atelier",
    );
    expect(
      applySettingsTranslation({ footerText: "Fait main", navigation: [] }, config, {
        footerText: "Handmade",
      }),
    ).toEqual({ footerText: "Handmade", navigation: [] });
  });

  it("keeps what the translator changed, and flags the texts to review", () => {
    const source = pageTexts(hero("h"), config);
    const edited = source.map((t) => (t.key === "h/title" ? { ...t, value: "Welcome" } : { ...t }));
    const first = collectTranslation(source, edited, undefined);
    expect(first.values).toEqual({ "h/title": "Welcome" });
    expect(first.sources["h/title"]).toBe(textFingerprint("Bienvenue à l'atelier"));
    expect(translationStatus(source, first)).toEqual({
      total: 5,
      translated: 1,
      outdated: 0,
      state: "partial",
    });
    // The French title changes: the English one is to review.
    const changed = source.map((t) => (t.key === "h/title" ? { ...t, value: "Bonjour" } : t));
    expect(translationStatus(changed, first).state).toBe("outdated");
    // Translating it again (even to the same text) makes it current.
    const again = collectTranslation(
      changed,
      changed.map((t) => (t.key === "h/title" ? { ...t, value: "Hello" } : t)),
      first,
    );
    expect(translationStatus(changed, again)).toMatchObject({ translated: 1, outdated: 0 });
  });
});

const settings = {
  site: { name: "Atelier", lang: "fr", locales: ["en", "fr", "xx", "en"] },
  values: { footerText: "Fait main", navigation: [] },
  translations: {
    en: { site: { name: "Workshop" }, values: { footerText: "Handmade" } },
    de: { values: { footerText: "Handgemacht" } },
  },
};

const page = (id: string, slug: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug,
  title: id,
  status: "published" as const,
  seo: {},
  data: hero(`${id}-hero`),
  ...extra,
});

describe("multilingual snapshot", () => {
  const snapshot = createSnapshot({
    releaseId: "r1",
    settings,
    pages: [
      page("accueil", "", { translations: { en: { title: "Home", values: {} } } }),
      page("contact", "contact", {
        translations: {
          en: {
            title: "Contact us",
            slug: "contact-us",
            seo: { description: "Write to us" },
            values: { "contact-hero/title": "Write to us" },
          },
          de: { values: {} },
        },
      }),
      page("tarifs", "tarifs"),
    ],
  });

  it("keeps the valid languages and their translations only", () => {
    expect(siteLocales(settings.site)).toEqual(["en"]);
    expect(snapshot.site.locales).toEqual(["en"]);
    expect(snapshot.settingsTranslations).toEqual({
      en: { site: { name: "Workshop" }, values: { footerText: "Handmade" } },
    });
    expect(snapshot.pages.find((p) => p.id === "contact")?.translations).toEqual({
      en: {
        title: "Contact us",
        slug: "contact-us",
        seo: { description: "Write to us" },
        values: { "contact-hero/title": "Write to us" },
      },
    });
  });

  it("publishes each language at /<lang>/, links pointing to the translated pages", () => {
    const english = localizeSnapshot(snapshot, "en", config);
    expect(english.site).toMatchObject({ lang: "en", name: "Workshop" });
    expect(english.settings).toMatchObject({ footerText: "Handmade" });
    expect(english.pages.map((p) => [p.slug, p.title])).toEqual([
      ["en", "Home"],
      ["en/contact-us", "Contact us"],
    ]);
    const home = english.pages[0]!.data.content[0]!.props as Record<string, any>;
    // A link to a translated page leads to its English version.
    expect(home.cta.href).toBe("/en/contact-us/");
    const contact = english.pages[1]!;
    expect((contact.data.content[0]!.props as Record<string, any>).title).toBe("Write to us");
    expect(contact.seo.description).toBe("Write to us");
    expect(publishedPaths(snapshot)).toEqual([
      "/",
      "/contact/",
      "/tarifs/",
      "/en/",
      "/en/contact-us/",
    ]);
    expect(pageAtPath(snapshot, "/en/contact-us")).toMatchObject({
      page: { id: "contact" },
      locale: "en",
      values: { "contact-hero/title": "Write to us" },
    });
  });

  it("offers each page in the other language, or that language's home page", () => {
    const versions = siteVersions(snapshot, config);
    expect(languageLinks(versions, "contact", "fr")).toEqual([
      { lang: "fr", label: "Français", href: "/contact/", current: true },
      { lang: "en", label: "English", href: "/en/contact-us/", current: false },
    ]);
    expect(languageLinks(versions, "tarifs", "fr")[1]).toMatchObject({ href: "/en/" });
  });

  it("refuses addresses reserved for a language, and two pages at one address", () => {
    expect(() =>
      createSnapshot({ releaseId: "r", settings, pages: [page("en-page", "en/offre")] }),
    ).toThrow(SnapshotError);
    try {
      createSnapshot({
        releaseId: "r",
        settings,
        pages: [
          page("a", "a", { translations: { en: { slug: "same", values: {} } } }),
          page("b", "b", { translations: { en: { slug: "same", values: {} } } }),
        ],
      });
      expect.unreachable();
    } catch (error) {
      expect((error as SnapshotError).details).toEqual([
        "Pages « a » et « b » : même adresse /en/same/ en « en »",
      ]);
    }
  });
});

describe("hours in the page's language", () => {
  const hours = {
    mo: [],
    tu: [{ opens: "09:00", closes: "12:30" }],
    we: [{ opens: "09:00", closes: "12:30" }],
    th: [{ opens: "09:00", closes: "12:30" }],
    fr: [],
    sa: [],
    su: [],
  };
  it("writes them in English", () => {
    expect(formatOpeningHours(hours, "en")).toEqual([
      "Monday: closed",
      "Tuesday to Thursday: 9:00 AM – 12:30 PM",
      "Friday to Sunday: closed",
    ]);
    expect(formatClosure({ from: "2026-08-10", to: "2026-08-20", label: "Summer" }, "en")).toBe(
      "Closed from August 10, 2026 to August 20, 2026 (Summer)",
    );
    expect(formatOpeningHours(hours)[1]).toBe(
      "Du mardi au jeudi\u00a0: 9\u00a0h – 12\u00a0h\u00a030",
    );
  });
});
