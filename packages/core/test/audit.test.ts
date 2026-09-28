import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
  type AuditPage,
  auditSite,
  dateField,
  defineConfig,
  imageField,
  legalDocumentField,
  linkField,
} from "../src/index.js";

const config = defineConfig({
  site: { name: "Boulangerie", lang: "fr" },
  components: {
    Hero: {
      label: "En-tête",
      fields: {
        title: { type: "text", contentEditable: true },
        text: { type: "textarea", contentEditable: true },
        image: imageField({ label: "Image" }),
        cta: linkField({ label: "Bouton" }),
        cards: {
          type: "array",
          arrayFields: { photo: imageField({ label: "Photo" }) },
        },
      },
      defaultProps: { title: "Bienvenue", text: "", image: null, cta: null, cards: [] },
      render: () => null as never,
    },
    Legal: {
      label: "Page légale",
      fields: { legalDocument: legalDocumentField(), extra: { type: "richtext" } },
      defaultProps: { legalDocument: "privacy", extra: "" },
      render: () => null as never,
    },
    Article: {
      label: "Article",
      fields: {
        title: { type: "text", contentEditable: true },
        date: dateField({ label: "Date" }),
        cover: imageField({ label: "Image" }),
        body: { type: "richtext" },
      },
      defaultProps: { title: "Titre", date: "", cover: null, body: "" },
      render: () => null as never,
    },
  },
  collections: {
    actualites: {
      label: "Actualités",
      path: "actualites",
      component: "Article",
      dateField: "date",
      imageField: "cover",
    },
  },
});

const long =
  "Pain au levain cuit au feu de bois chaque matin dans notre fournil du centre-ville. ".repeat(8);

const hero = (props: Record<string, unknown>): Data =>
  ({
    root: { props: {} },
    content: [{ type: "Hero", props: { id: "hero", title: "Bienvenue", text: long, ...props } }],
  }) as Data;

const page = (partial: Partial<AuditPage> & Pick<AuditPage, "id" | "slug">): AuditPage => ({
  title: partial.id,
  status: "published",
  seo: {
    description: `Boulangerie artisanale au levain à Lyon, page ${partial.id} : pains, viennoiseries et gâteaux.`,
  },
  data: hero({}),
  updatedAt: "2026-09-01T00:00:00Z",
  ...partial,
});

const legalData = (kind: "privacy" | "notice"): Data =>
  ({
    root: { props: {} },
    content: [{ type: "Legal", props: { id: `legal-${kind}`, legalDocument: kind, extra: "" } }],
  }) as Data;

const legalPages = [
  page({ id: "confidentialite", slug: "confidentialite", data: legalData("privacy") }),
  page({ id: "mentions", slug: "mentions-legales", data: legalData("notice") }),
];

/** The footer links to both legal pages. */
const footer = {
  legalLinks: [
    { label: "Mentions légales", link: { kind: "page", pageId: "mentions", href: "/m/" } },
    { label: "Confidentialité", link: { kind: "page", pageId: "confidentialite", href: "/c/" } },
  ],
};

const completeSite = {
  name: "Boulangerie",
  lang: "fr",
  url: "https://boulangerie.fr",
  description: "Boulangerie au levain à Lyon.",
  business: {
    type: "Bakery",
    phone: "04 00 00 00 00",
    street: "1 rue du Four",
    city: "Lyon",
    hours: { tu: [{ opens: "08:00", closes: "19:00" }] },
    links: ["https://g.page/boulangerie"],
  },
  legal: {
    publisher: "SARL Boulangerie du Four",
    registration: "RCS Lyon 123 456 789",
    director: "Marie Martin",
    privacyEmail: "donnees@boulangerie.fr",
  },
};

describe("auditSite", () => {
  it("finds nothing on a complete site", () => {
    const audit = auditSite({
      config,
      pages: [
        page({ id: "accueil", slug: "" }),
        page({ id: "contact", slug: "contact" }),
        ...legalPages,
      ],
      site: completeSite,
      today: "2026-09-28",
      settings: footer,
    });
    expect(audit.findings).toEqual([]);
    expect(audit.score).toBe(100);
    expect(audit.pagesChecked).toBe(4);
  });

  it("names what is missing, most important first, with how to fix it", () => {
    const audit = auditSite({
      config,
      pages: [
        page({
          id: "accueil",
          slug: "",
          seo: {},
          data: hero({
            image: { src: "https://cdn/x/pain.webp?alt=media", alt: "" },
            cta: { kind: "page", pageId: "tarifs", href: "/tarifs/" },
            cards: [
              { photo: { src: "/images/a.webp", alt: "Baguette" } },
              { photo: { src: "/images/b.webp", alt: " " } },
            ],
          }),
        }),
        page({ id: "tarifs", slug: "tarifs", status: "draft" }),
        page({
          id: "vieux",
          slug: "vieux",
          title: "Ancienne page",
          updatedAt: "2024-01-01T00:00:00Z",
          data: hero({ text: "Court." }),
        }),
        page({
          id: "article",
          slug: "actualites/nouveau",
          collection: "actualites",
          seo: {},
          data: {
            root: { props: {} },
            content: [
              {
                type: "Article",
                props: { id: "a", title: "Nouveau", date: "", cover: null, body: `<p>${long}</p>` },
              },
            ],
          } as Data,
        }),
      ],
      site: { name: "Boulangerie", lang: "fr" },
      today: "2026-09-28",
    });
    const codes = audit.findings.map((f) => f.code);
    expect(codes.slice(0, 6)).toEqual([
      "site-url",
      "business-missing",
      "legal-privacy",
      "legal-notice",
      "page-description",
      "link-broken",
    ]);
    expect(codes).toEqual(
      expect.arrayContaining([
        "site-description",
        "image-alt",
        "item-date",
        "item-image",
        "page-thin",
        "page-stale",
      ]),
    );
    // The article's description comes from its text: no « page-description » for it.
    expect(
      audit.findings.filter((f) => f.code === "page-description").map((f) => f.page?.id),
    ).toEqual(["accueil"]);
    const alts = audit.findings.filter((f) => f.code === "image-alt");
    expect(alts.map((f) => f.field)).toEqual(["image", "cards[1].photo"]);
    expect(alts[0]).toMatchObject({ section: "hero", page: { id: "accueil", path: "/" } });
    expect(alts[0]?.fix).toContain(
      '"image": { "src": "https://cdn/x/pain.webp?alt=media", "alt": "…" }',
    );
    expect(audit.findings.find((f) => f.code === "link-broken")?.message).toContain("page masquée");
    expect(audit.counts.high).toBe(6);
    expect(audit.score).toBeLessThan(60);
  });

  it("flags duplicate titles and incomplete business profiles", () => {
    const audit = auditSite({
      config,
      pages: [
        page({ id: "a", slug: "a", title: "Nos pains" }),
        page({ id: "b", slug: "b", title: "Nos pains" }),
        ...legalPages,
      ],
      site: { ...completeSite, business: { type: "Bakery", city: "Lyon" } },
      today: "2026-09-28",
    });
    expect(audit.findings.map((f) => f.code)).toEqual([
      "business-contact",
      "business-hours",
      "duplicate-title",
      "business-links",
    ]);
  });

  it("asks for the legal pages, linked from every page, and the publisher's details", () => {
    const missing = auditSite({
      config,
      pages: [page({ id: "accueil", slug: "" })],
      site: { ...completeSite, legal: undefined },
      today: "2026-09-28",
    });
    const privacy = missing.findings.find((f) => f.code === "legal-privacy");
    expect(privacy?.severity).toBe("high");
    expect(privacy?.fix).toContain('add_section « Legal » avec legalDocument: "privacy"');
    expect(missing.findings.find((f) => f.code === "legal-info")?.message).toBe(
      "Informations légales incomplètes : nom ou raison sociale, numéro d'immatriculation (SIREN, RCS…), directeur de la publication, e-mail pour les données personnelles.",
    );

    const unlinked = auditSite({
      config,
      pages: [page({ id: "accueil", slug: "" }), ...legalPages],
      site: completeSite,
      today: "2026-09-28",
      settings: { legalLinks: [footer.legalLinks[0]] },
    });
    expect(unlinked.findings.map((f) => [f.code, f.page?.id])).toEqual([
      ["legal-link", "confidentialite"],
    ]);
  });

  it("audits one page, draft included, without the site-wide checks", () => {
    const audit = auditSite({
      config,
      pages: [page({ id: "brouillon", slug: "brouillon", status: "draft", seo: {} })],
      site: { name: "Boulangerie", lang: "fr" },
      today: "2026-09-28",
      pageId: "brouillon",
    });
    expect(audit.findings.map((f) => f.code)).toEqual(["page-description"]);
  });
});
