import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
  getLegalDocument,
  type LegalDocument,
  legalDocuments,
  legalDocumentText,
  legalFacts,
  legalGaps,
  sanitizeLegal,
  statsOptOutProps,
} from "../src/index.js";

const legalSection = (kind: string): Data =>
  ({
    root: { props: {} },
    content: [{ type: "Legal", props: { id: `l-${kind}`, legalDocument: kind } }],
  }) as Data;

const contactForm: Data = {
  root: { props: {} },
  content: [
    {
      type: "ContactForm",
      props: { id: "form", formFields: [{ label: "E-mail", type: "email", required: "yes" }] },
    },
  ],
} as Data;

const site = {
  name: "Boulangerie du Four",
  lang: "fr",
  business: {
    email: "bonjour@four.fr",
    phone: "04 72 00 00 00",
    street: "1 rue du Four",
    postalCode: "69001",
    city: "Lyon",
  },
  legal: {
    publisher: "SARL Boulangerie du Four",
    legalForm: "SARL au capital de 10 000 €",
    registration: "RCS Lyon 123 456 789",
    director: "Marie Martin",
  },
};

const pages = [
  { slug: "", status: "published", data: { root: { props: {} }, content: [] } as Data },
  { slug: "contact", status: "published", data: contactForm },
  { slug: "confidentialite", status: "published", data: legalSection("privacy") },
  { slug: "mentions-legales", status: "published", data: legalSection("notice") },
];

/** A document's whole text, links included. */
const text = (document: LegalDocument) => legalDocumentText(document);

describe("legal pages", () => {
  it("reads the facts from the site: forms, legal pages, integrations", () => {
    const facts = legalFacts({
      site,
      pages,
      integrations: { recaptchaSiteKey: "k", mail: "resend", region: "europe-west1" },
      date: "2026-09-28T08:00:00Z",
    });
    expect(facts).toMatchObject({
      date: "2026-09-28",
      stats: true,
      analytics: false,
      forms: true,
      recaptcha: true,
      mail: true,
      region: "europe-west1",
      pages: { privacy: "/confidentialite/", notice: "/mentions-legales/" },
    });
    // A form on a hidden page is not published.
    expect(
      legalFacts({ site, pages: [{ slug: "x", status: "draft", data: contactForm }] }).forms,
    ).toBe(false);
  });

  it("writes the privacy policy from what the site does", () => {
    const { privacy } = legalDocuments(
      legalFacts({
        site,
        pages,
        integrations: { recaptchaSiteKey: "k", mail: "resend", region: "europe-west1" },
        date: "2026-09-28",
      }),
    );
    const all = text(privacy);
    expect(privacy.title).toBe("Politique de confidentialité");
    expect(privacy.lead).toContain("le 28\u00a0septembre 2026");
    expect(privacy.sections.map((s) => s.heading)).toEqual([
      "Responsable du traitement",
      "En bref",
      "Consultation du site",
      "Mesure d\u2019audience sans cookie",
      "Formulaires de contact",
      "Qui reçoit vos données",
      "Cookies",
      "Vos droits",
      "Mise à jour",
    ]);
    expect(all).toContain("SARL Boulangerie du Four, 1 rue du Four, 69001 Lyon");
    expect(all).toContain("conservés 25\u00a0mois");
    expect(all).toContain("3\u00a0ans au plus");
    expect(all).toContain("reCAPTCHA Enterprise");
    expect(all).toContain("Resend, Inc. (États-Unis)");
    expect(all).toContain("Google Cloud France SARL (Google Cloud)");
    expect(all).toContain("en Belgique");
    expect(all).toContain("Cookie _GRECAPTCHA");
    expect(all).toContain("conditions de la CNIL");
    expect(all).not.toContain("Google Analytics");
    // French typography: no-break space before the colon.
    expect(privacy.sections[5]?.blocks[0]).toMatchObject({
      type: "p",
      text: [expect.stringMatching(/techniques, tenus par contrat.*\u00a0:$/)],
    });
    // Rights: the e-mail and the CNIL are links.
    const rights = privacy.sections.find((s) => s.heading === "Vos droits");
    expect(JSON.stringify(rights)).toContain('"href":"mailto:bonjour@four.fr"');
    expect(JSON.stringify(rights)).toContain('"href":"https://www.cnil.fr/fr/plaintes"');
    // The visitor's switch, with the texts the site's script swaps.
    const optOut = privacy.sections[3]?.blocks.find((b) => b.type === "stats-optout");
    expect(optOut && statsOptOutProps(optOut as never).button).toMatchObject({
      "data-of-stats-optout": "",
      "data-stop": "Ne plus compter mes visites",
      "data-resume": "Compter à nouveau mes visites",
    });
  });

  it("says when the site sets no cookie, and follows Google Analytics when it is on", () => {
    const quiet = legalDocuments(
      legalFacts({ site: { ...site, stats: "off" }, pages: pages.slice(0, 1) }),
    ).privacy;
    expect(text(quiet)).toContain("Ce site ne dépose aucun cookie.");
    expect(quiet.sections.some((s) => s.heading.startsWith("Mesure"))).toBe(false);
    expect(quiet.sections.some((s) => s.heading.startsWith("Formulaires"))).toBe(false);

    const analytics = legalDocuments(
      legalFacts({ site: { ...site, gaMeasurementId: "G-ABC123" }, pages }),
    ).privacy;
    const section = analytics.sections.find((s) => s.heading.startsWith("Google Analytics"));
    expect(section?.blocks.at(-1)).toEqual({
      type: "consent",
      label: "Choisir pour les cookies",
    });
    expect(text(analytics)).toContain("Google Ireland Limited");
    expect(text(analytics)).toContain("13\u00a0mois au plus");
  });

  it("writes the legal notice, with the host of the owner's country", () => {
    const { notice } = legalDocuments(legalFacts({ site, pages, date: "2026-09-28" }));
    expect(notice.title).toBe("Mentions légales");
    expect(notice.sections[0]).toEqual({
      heading: "Éditeur du site",
      blocks: [
        {
          type: "list",
          plain: true,
          items: [
            ["SARL Boulangerie du Four"],
            ["SARL au capital de 10\u00a0000\u00a0€"],
            ["Adresse\u00a0: 1 rue du Four, 69001 Lyon"],
            ["Immatriculation\u00a0: RCS Lyon 123\u00a0456\u00a0789"],
            ["Téléphone\u00a0: ", { text: "04 72 00 00 00", href: "tel:0472000000" }],
            ["E-mail\u00a0: ", { text: "bonjour@four.fr", href: "mailto:bonjour@four.fr" }],
            ["Directeur de la publication\u00a0: Marie Martin"],
          ],
        },
      ],
    });
    expect(text(notice)).toContain("Google Cloud France SARL");
    expect(text(notice)).toContain("8 rue de Londres, 75009 Paris");
    expect(JSON.stringify(notice)).toContain('"href":"/confidentialite/"');

    const belgian = legalDocuments(
      legalFacts({ site: { ...site, business: { ...site.business, country: "BE" } }, pages }),
    );
    expect(text(belgian.notice)).toContain("Google Cloud EMEA Limited");
    expect(JSON.stringify(belgian.privacy)).toContain("autoriteprotectiondonnees.be");
  });

  it("writes in English for a site in another language", () => {
    const { privacy, notice } = legalDocuments(
      legalFacts({ site: { ...site, lang: "en" }, pages, date: "2026-09-28" }),
    );
    expect(privacy.title).toBe("Privacy policy");
    expect(privacy.lead).toContain("September 28, 2026");
    expect(notice.sections[0]?.heading).toBe("Publisher");
  });

  it("lists what the legal notice lacks, and keeps only valid details", () => {
    expect(legalGaps({ siteName: "Site", business: site.business, legal: site.legal })).toEqual([]);
    expect(legalGaps({ siteName: "Site" })).toEqual([
      "nom ou raison sociale",
      "numéro d'immatriculation (SIREN, RCS…)",
      "adresse",
      "téléphone ou e-mail",
      "directeur de la publication",
      "e-mail pour les données personnelles",
    ]);
    expect(
      sanitizeLegal({
        publisher: "  SARL   Four ",
        privacyEmail: "pas un e-mail",
        vat: 12,
        x: "y",
      }),
    ).toEqual({ publisher: "SARL Four" });
    expect(sanitizeLegal({ director: " " })).toBeUndefined();
  });

  it("gives a section the document it shows", () => {
    const documents = legalDocuments(legalFacts({ site, pages }));
    expect(getLegalDocument({ legal: documents }, "notice")?.kind).toBe("notice");
    expect(getLegalDocument({ legal: documents }, "other")).toBeUndefined();
    expect(getLegalDocument(undefined, "privacy")).toBeUndefined();
  });
});
