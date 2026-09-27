import { describe, expect, it } from "vitest";
import {
  type AgentBackend,
  type AgentSettings,
  buildLlmsTxt,
  buildSiteSchema,
  businessJsonLd,
  configFromSchema,
  createSnapshot,
  defineConfig,
  formatClosure,
  formatOpeningHours,
  pageJsonLd,
  runAgentTool,
  sanitizeBusiness,
} from "../src/index.js";

const tuesdayToSaturday = {
  mo: [],
  tu: [
    { opens: "09:00", closes: "12:30" },
    { opens: "14:00", closes: "19:00" },
  ],
  we: [
    { opens: "09:00", closes: "12:30" },
    { opens: "14:00", closes: "19:00" },
  ],
  th: [
    { opens: "09:00", closes: "12:30" },
    { opens: "14:00", closes: "19:00" },
  ],
  fr: [
    { opens: "09:00", closes: "12:30" },
    { opens: "14:00", closes: "19:00" },
  ],
  sa: [{ opens: "08:00", closes: "13:00" }],
  su: [],
};

const business = {
  type: "Bakery",
  phone: "01 23 45 67 89",
  email: "bonjour@pain.fr",
  street: "12 rue du Four",
  postalCode: "75006",
  city: "Paris",
  hours: tuesdayToSaturday,
  closures: [
    { from: "2026-08-10", to: "2026-08-20", label: "congés d'été" },
    { from: "2025-12-25" },
  ],
  priceRange: "€€" as const,
  links: ["https://g.page/pain"],
};

describe("business profile", () => {
  it("reads the week in French, grouping days with the same hours", () => {
    expect(formatOpeningHours(tuesdayToSaturday)).toEqual([
      "Lundi : fermé",
      "Du mardi au vendredi : 9 h – 12 h 30, 14 h – 19 h",
      "Samedi : 8 h – 13 h",
      "Dimanche : fermé",
    ]);
    expect(formatOpeningHours({ sa: [{ opens: "10:00", closes: "18:00" }] })).toEqual([
      "Du lundi au vendredi : fermé",
      "Samedi : 10 h – 18 h",
      "Dimanche : fermé",
    ]);
    expect(formatOpeningHours(undefined)).toEqual([]);
    expect(formatClosure({ from: "2026-08-10", to: "2026-08-20", label: "congés d'été" })).toBe(
      "Fermé du 10 août 2026 au 20 août 2026 (congés d'été)",
    );
  });

  it("keeps only valid parts", () => {
    expect(
      sanitizeBusiness({
        phone: "01 02",
        email: "pas-un-email",
        type: "Spaceship",
        hours: { mo: [{ opens: "18:00", closes: "09:00" }] },
        links: ["javascript:alert(1)"],
      }),
    ).toEqual({ phone: "01 02" });
    expect(sanitizeBusiness({})).toBeUndefined();
  });

  it("describes the business in JSON-LD, closed days included", () => {
    const ld = businessJsonLd(
      { name: "Boulangerie", url: "https://pain.fr", business },
      { today: "2026-07-01", url: "https://pain.fr/" },
    )!;
    expect(ld).toMatchObject({
      "@type": "Bakery",
      "@id": "https://pain.fr/#business",
      name: "Boulangerie",
      telephone: "01 23 45 67 89",
      address: { streetAddress: "12 rue du Four", addressLocality: "Paris", addressCountry: "FR" },
      priceRange: "€€",
      sameAs: ["https://g.page/pain"],
    });
    expect(ld.openingHoursSpecification).toEqual([
      expect.objectContaining({
        dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "09:00",
        closes: "12:30",
      }),
      expect.objectContaining({
        dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "14:00",
      }),
      expect.objectContaining({ dayOfWeek: ["Saturday"], opens: "08:00", closes: "13:00" }),
    ]);
    // Past closures are left out.
    expect(ld.specialOpeningHoursSpecification).toEqual([
      expect.objectContaining({
        validFrom: "2026-08-10",
        validThrough: "2026-08-20",
        opens: "00:00",
      }),
    ]);
  });

  it("publishes it on the home page and in llms.txt", () => {
    const config = defineConfig({ site: { name: "Boulangerie" }, components: {} });
    const snapshot = createSnapshot({
      releaseId: "r",
      createdAt: "2026-07-01T10:00:00.000Z",
      settings: {
        site: {
          name: "Boulangerie",
          lang: "fr",
          url: "https://pain.fr",
          business: { ...business, fax: "x" } as never,
        },
        values: {},
      },
      pages: [
        {
          id: "home",
          slug: "",
          title: "Accueil",
          status: "published",
          seo: {},
          data: { root: { props: {} }, content: [] },
        },
      ],
    });
    expect((snapshot.site.business as Record<string, unknown>).fax).toBeUndefined();
    const [site, org] = pageJsonLd(snapshot, snapshot.pages[0]!, config);
    expect(site).toMatchObject({
      "@type": "WebSite",
      publisher: { "@id": "https://pain.fr/#business" },
    });
    expect(org?.["@type"]).toBe("Bakery");
    const llms = buildLlmsTxt(snapshot, config);
    expect(llms).toContain("## Informations pratiques");
    expect(llms).toContain("- Adresse : 12 rue du Four, 75006 Paris");
    expect(llms).toContain("  - Du mardi au vendredi : 9 h – 12 h 30, 14 h – 19 h");
    expect(llms).toContain("- Fermé du 10 août 2026 au 20 août 2026 (congés d'été)");
  });

  it("is updated by the AI assistant, closures one at a time", async () => {
    const settings: AgentSettings = {
      site: { name: "Boulangerie", lang: "fr" },
      values: {},
      theme: {},
    };
    const backend = {
      getSettings: async () => structuredClone(settings),
      saveBusiness: async (value) => {
        if (value) settings.site.business = value;
        else delete settings.site.business;
      },
      listPages: async () => [],
      listReleases: async () => [],
    } as Partial<AgentBackend> as AgentBackend;
    const config = defineConfig({ site: { name: "Boulangerie" }, components: {} });
    const ctx = {
      config: configFromSchema(buildSiteSchema(config)),
      schema: buildSiteSchema(config),
      backend,
    };
    const run = (name: string, args: unknown) => runAgentTool(name, args, ctx) as Promise<any>;
    await run("update_business", {
      type: "Bakery",
      phone: "01 00 00 00 00",
      hours: tuesdayToSaturday,
    });
    await run("update_business", { hours: { mo: [{ opens: "10:00", closes: "12:00" }] } });
    const result = await run("update_business", {
      addClosure: { from: "2026-12-24", to: "2026-12-26", label: "Noël" },
    });
    expect(settings.site.business?.hours?.mo).toEqual([{ opens: "10:00", closes: "12:00" }]);
    expect(settings.site.business?.hours?.sa).toEqual([{ opens: "08:00", closes: "13:00" }]);
    expect(settings.site.business?.closures).toEqual([
      { from: "2026-12-24", to: "2026-12-26", label: "Noël" },
    ]);
    expect(result.summary).toContain("- Téléphone : 01 00 00 00 00");
    await expect(run("update_business", { email: "pas-un-email" })).rejects.toThrow(
      "Fiche refusée",
    );
    await run("update_business", { phone: null });
    expect(settings.site.business?.phone).toBeUndefined();
    const overview = await run("get_site_overview", {});
    expect(overview.business).toContain("Activité : Boulangerie, pâtisserie");
  });
});
