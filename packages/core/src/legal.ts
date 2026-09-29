import type { Data, SelectField } from "@puckeditor/core";
import { type BusinessInfo, formatAddress } from "./business.js";
import type { OpenFlowConfig } from "./config.js";
import type { SiteSettings } from "./model.js";
import { walkComponents } from "./walk.js";

/**
 * Legal pages written from what the site really does: the privacy policy lists the processing the
 * site performs (hosting, audience measurement without cookies, Google Analytics, forms,
 * reCAPTCHA, e-mails), and the legal notice (mentions légales) the publisher and the host. Both are
 * rebuilt at each publication, so turning on Google Analytics or adding a form updates them.
 *
 * A section shows one of them when its `legalDocument` prop (`legalDocumentField()`) says which;
 * the host (published page, admin editor) passes the documents in `puck.metadata.legal`, written
 * by `legalDocuments` (`legal-documents.ts`, kept apart: the site's sections and the admin's
 * login screen do not download the texts).
 */

export type LegalDocumentKind = "privacy" | "notice";

/** Name of the section prop choosing the document (as `formFields` marks a form). */
export const LEGAL_DOCUMENT_PROP = "legalDocument";

/** Messages of the forms are erased this long after they arrive (TTL on `expiresAt`). */
export const MESSAGE_RETENTION_YEARS = 3;

/** The publisher of the site (« Informations légales »). */
export interface LegalInfo {
  /** Legal name, or the person's name for a sole trader: « SARL Boulangerie Martin ». */
  publisher?: string;
  /** Legal form and capital: « SARL au capital de 10 000 € », « Entrepreneur individuel ». */
  legalForm?: string;
  /** Registration: « RCS Lyon 123 456 789 », « SIREN 123 456 789 (RNE) ». */
  registration?: string;
  /** Intra-community VAT number. */
  vat?: string;
  /** Registered office, when it is not the business address. */
  address?: string;
  /** Director of publication (a person). */
  director?: string;
  /** Where visitors exercise their rights (the business e-mail otherwise). */
  privacyEmail?: string;
  /** Consumer mediator (name and website), required when selling to consumers in France. */
  mediator?: string;
}

export const LEGAL_LIMITS: Record<keyof LegalInfo, number> = {
  publisher: 160,
  legalForm: 160,
  registration: 120,
  vat: 40,
  address: 240,
  director: 120,
  privacyEmail: 120,
  mediator: 240,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keeps the valid parts of the legal information (anything else is dropped at publication). */
export function sanitizeLegal(value: unknown): LegalInfo | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, max] of Object.entries(LEGAL_LIMITS)) {
    const entry = (value as Record<string, unknown>)[key];
    if (typeof entry !== "string") continue;
    const text = entry.replace(/\s+/g, " ").trim().slice(0, max);
    if (!text || (key === "privacyEmail" && !EMAIL.test(text))) continue;
    out[key] = text;
  }
  return Object.keys(out).length > 0 ? (out as LegalInfo) : undefined;
}

/** The field choosing which legal document a section shows. */
export function legalDocumentField(
  options: { label?: string } = {},
): SelectField & { options: Array<{ label: string; value: LegalDocumentKind }> } {
  return {
    type: "select",
    label: options.label ?? "Document",
    options: [
      { label: "Politique de confidentialité", value: "privacy" },
      { label: "Mentions légales", value: "notice" },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Facts

/** What the legal pages are written from. */
export interface LegalFacts {
  lang: string;
  /** Day the documents describe (`YYYY-MM-DD`): the publication, or today in the editor. */
  date: string;
  siteName: string;
  url?: string;
  business?: BusinessInfo;
  legal?: LegalInfo;
  /** Audience measurement without cookies (Statistiques). */
  stats: boolean;
  /** Google Analytics, after consent. */
  analytics: boolean;
  /** At least one published page has a form. */
  forms: boolean;
  /** At least one published page takes appointments. */
  booking: boolean;
  /** The forms are protected by reCAPTCHA Enterprise. */
  recaptcha: boolean;
  /** The messages are e-mailed to the owner (Resend). */
  mail: boolean;
  /** Google Cloud region of the site's data (`europe-west1`). */
  region?: string;
  /** Addresses of the published legal pages, for the links between them. */
  pages: Partial<Record<LegalDocumentKind, string>>;
}

export interface LegalFactsInput {
  site: Omit<SiteSettings, "lang"> & { lang?: string };
  pages: Array<{ slug: string; status?: string; data: Data }>;
  integrations?: { recaptchaSiteKey?: string; mail?: string; region?: string };
  /** `YYYY-MM-DD` or an ISO time; today by default. */
  date?: string;
}

/** The legal documents shown by a page's sections (`privacy`, `notice`), in page order. */
export function legalSectionsOf(data: Data): LegalDocumentKind[] {
  const kinds: LegalDocumentKind[] = [];
  walkComponents(data, (item) => {
    const kind = (item.props as Record<string, unknown>)[LEGAL_DOCUMENT_PROP];
    if (kind === "privacy" || kind === "notice") kinds.push(kind);
  });
  return kinds;
}

/**
 * The section type showing legal documents (its fields hold `legalDocument`), if the site has one:
 * `legalComponentOf(config.components)`, or the sections of the AI tools' site schema.
 */
export function legalComponentOf(
  components: OpenFlowConfig["components"] | Record<string, { fields?: object } | undefined>,
): string | undefined {
  return Object.entries(components).find(
    ([, component]) => LEGAL_DOCUMENT_PROP in ((component?.fields ?? {}) as object),
  )?.[0];
}

/** Name of the publisher, its address and its e-mail for privacy requests. */
export function publisherOf(facts: Pick<LegalFacts, "legal" | "business" | "siteName">) {
  const { legal, business } = facts;
  return {
    name: legal?.publisher || business?.name || facts.siteName,
    address: legal?.address || formatAddress(business),
    email: legal?.privacyEmail || business?.email,
    phone: business?.phone,
  };
}

/** What the legal notice lacks (French labels), for the admin and the site audit. */
export function legalGaps(facts: Pick<LegalFacts, "legal" | "business" | "siteName">): string[] {
  const publisher = publisherOf(facts);
  const gaps: string[] = [];
  if (!facts.legal?.publisher) gaps.push("nom ou raison sociale");
  if (!facts.legal?.registration) gaps.push("numéro d'immatriculation (SIREN, RCS…)");
  if (!publisher.address) gaps.push("adresse");
  if (!publisher.email && !publisher.phone) gaps.push("téléphone ou e-mail");
  if (!facts.legal?.director) gaps.push("directeur de la publication");
  if (!publisher.email) gaps.push("e-mail pour les données personnelles");
  return gaps;
}

// ---------------------------------------------------------------------------------------------
// Documents

/** A run of text, or a link. */
export type LegalText = string | { text: string; href: string };

export type LegalBlock =
  | { type: "p"; text: LegalText[] }
  /** `plain`: lines without bullets (an address, an identity). */
  | { type: "list"; items: LegalText[][]; plain?: boolean }
  /**
   * The visitor's switch for the audience measurement: `status` holds what is shown, the other
   * texts are swapped in by the site's script (`OpenFlowStats`) according to the visitor's choice.
   */
  | {
      type: "stats-optout";
      counted: string;
      excluded: string;
      refused: string;
      stop: string;
      resume: string;
    }
  /** Reopens the cookie banner of Google Analytics. */
  | { type: "consent"; label: string };

export interface LegalSection {
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  kind: LegalDocumentKind;
  title: string;
  /** What the document is, and the day it describes. */
  lead: string;
  sections: LegalSection[];
}

export type LegalDocuments = Record<LegalDocumentKind, LegalDocument>;

/**
 * Attributes of the visitor's switch for the audience measurement, read by the site's script
 * (`OpenFlowStats`): `<p {...status}>{block.counted}</p><button {...button}>{block.stop}</button>`.
 */
export function statsOptOutProps(block: Extract<LegalBlock, { type: "stats-optout" }>) {
  return {
    status: {
      role: "status",
      "data-of-stats-status": "",
      "data-counted": block.counted,
      "data-excluded": block.excluded,
      "data-refused": block.refused,
    },
    button: {
      type: "button" as const,
      "data-of-stats-optout": "",
      "data-stop": block.stop,
      "data-resume": block.resume,
    },
  };
}

/** Attributes of the button reopening the cookie banner (`OpenFlowAnalytics`). */
export function consentButtonProps() {
  return { type: "button" as const, "data-of-consent-open": "" };
}

/** The document a section shows (`getLegalDocument(puck.metadata, legalDocument)`). */
export function getLegalDocument(
  metadata: unknown,
  kind: LegalDocumentKind | string | undefined,
): LegalDocument | undefined {
  const documents = (metadata as { legal?: Partial<LegalDocuments> } | undefined)?.legal;
  return kind === "privacy" || kind === "notice" ? documents?.[kind] : undefined;
}
