import type { Data, Field, Fields } from "@puckeditor/core";
import { businessJsonLd } from "./business.js";
import { collectionEntry } from "./collections.js";
import type { OpenFlowConfig } from "./config.js";
import { getOpenFlowFieldKind, type ImageValue, type LinkValue } from "./fields.js";
import { legalComponentOf, legalGaps, legalSectionsOf } from "./legal.js";
import { pageText } from "./llms.js";
import type { PageSeo, PageStatus, SiteSettings } from "./model.js";
import { slugToPath } from "./slug.js";
import { applyDefaults } from "./validate.js";
import { walkComponents } from "./walk.js";

/**
 * Site audit: what keeps the site from being found, understood and cited by search engines and AI
 * assistants, in the owner's words, with how to fix it. The AI tool `audit_site` serves it, so the
 * owner's assistant can draft the fixes (descriptions, image texts…) for the owner to approve.
 * Nothing is changed by the audit itself.
 */

export type AuditSeverity = "high" | "medium" | "low";

export interface AuditFinding {
  /** Stable code: `page-description`, `image-alt`… */
  code: string;
  severity: AuditSeverity;
  message: string;
  /** How to fix it (the owner in the admin, or the AI with which tool). */
  fix: string;
  page?: { id: string; title: string; path: string };
  /** For a field of a section: the section's id and the field's path (`update_section`). */
  section?: string;
  field?: string;
}

export interface SiteAudit {
  /** Indicative, 100 when nothing is found. */
  score: number;
  counts: Record<AuditSeverity, number>;
  findings: AuditFinding[];
  pagesChecked: number;
}

export interface AuditPage {
  id: string;
  slug: string;
  title: string;
  status: PageStatus;
  seo: PageSeo;
  data: Data;
  updatedAt?: string;
  collection?: string;
}

const WEIGHTS: Record<AuditSeverity, number> = { high: 10, medium: 4, low: 1 };
const ORDER: Record<AuditSeverity, number> = { high: 0, medium: 1, low: 2 };

const isImage = (value: unknown): value is ImageValue =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ImageValue).src === "string" &&
  "alt" in value;

const isPageLink = (value: unknown): value is Extract<LinkValue, { kind: "page" }> =>
  typeof value === "object" &&
  value !== null &&
  (value as LinkValue).kind === "page" &&
  typeof (value as { pageId?: unknown }).pageId === "string";

/** Images and page links of a section's values, with their field path (`items[1].image`). */
function valuesOf(
  fields: Fields | undefined,
  props: Record<string, unknown>,
  prefix = "",
): Array<{ kind: "image" | "link"; path: string; value: unknown }> {
  const out: Array<{ kind: "image" | "link"; path: string; value: unknown }> = [];
  for (const [key, field] of Object.entries((fields ?? {}) as Record<string, Field>)) {
    if (key.startsWith("_")) continue;
    const value = props[key];
    const path = prefix ? `${prefix}.${key}` : key;
    const kind = getOpenFlowFieldKind(field);
    if (kind === "image" || kind === "link") out.push({ kind, path, value });
    else if (field.type === "array" && Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === "object") {
          out.push(
            ...valuesOf(
              field.arrayFields as Fields,
              item as Record<string, unknown>,
              `${path}[${index}]`,
            ),
          );
        }
      });
    } else if (field.type === "object" && value && typeof value === "object") {
      out.push(...valuesOf(field.objectFields as Fields, value as Record<string, unknown>, path));
    }
  }
  return out;
}

/** Pages linked from the common content (menu, footer): `{ kind: "page", pageId }` values. */
function linkedPageIds(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) linkedPageIds(item, found);
  else if (isPageLink(value)) found.add(value.pageId);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) linkedPageIds(item, found);
  }
  return found;
}

const words = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Audits the published pages (or one page) and the site's profile. */
export function auditSite(input: {
  config: OpenFlowConfig;
  pages: AuditPage[];
  site: SiteSettings;
  /** `YYYY-MM-DD`. */
  today: string;
  /** Only this page (its id); the site-wide checks are skipped. */
  pageId?: string;
  /** Values of the common content (menu, footer): the legal pages must be linked from there. */
  settings?: Record<string, unknown>;
}): SiteAudit {
  const { config, site } = input;
  const findings: AuditFinding[] = [];
  const add = (finding: AuditFinding) => findings.push(finding);
  const published = input.pages.filter((p) => p.status === "published");
  const publishedIds = new Set(published.map((p) => p.id));
  const knownIds = new Set(input.pages.map((p) => p.id));
  const audited = input.pageId ? input.pages.filter((p) => p.id === input.pageId) : published;

  if (!input.pageId) {
    if (!site.url) {
      add({
        code: "site-url",
        severity: "high",
        message: "L'adresse du site n'est pas renseignée.",
        fix: "« Site et référencement » : « Adresse du site ». Sans elle, pas d'adresses canoniques, de plan du site complet, ni d'annonce IndexNow à Bing et Copilot.",
      });
    }
    if (!site.description?.trim()) {
      add({
        code: "site-description",
        severity: "medium",
        message: "Le site n'a pas de description par défaut.",
        fix: "« Site et référencement » : « Description par défaut » (une ou deux phrases sur l'activité et le lieu).",
      });
    }
    const business = site.business;
    if (!business || !businessJsonLd(site, { today: input.today })) {
      add({
        code: "business-missing",
        severity: "high",
        message:
          "La fiche établissement est vide : Google et les assistants IA ne connaissent ni vos horaires, ni votre adresse, ni votre téléphone.",
        fix: "Remplissez « Établissement », ou demandez à l'IA (outil update_business).",
      });
    } else {
      const place = business.type !== "Organization";
      if (!business.phone && !business.email) {
        add({
          code: "business-contact",
          severity: "medium",
          message: "La fiche établissement n'a ni téléphone ni e-mail.",
          fix: "update_business avec phone ou email.",
        });
      }
      if (place && !business.street && !business.city && !business.areaServed) {
        add({
          code: "business-address",
          severity: "medium",
          message: "La fiche établissement n'a ni adresse ni zone desservie.",
          fix: "update_business avec street, postalCode et city (ou areaServed).",
        });
      }
      if (place && !business.hours) {
        add({
          code: "business-hours",
          severity: "medium",
          message:
            "Les horaires d'ouverture ne sont pas renseignés : « Est-ce ouvert dimanche ? » reste sans réponse.",
          fix: "update_business avec hours (jour → plages horaires, [] pour un jour fermé).",
        });
      }
      if (!business.links?.length) {
        add({
          code: "business-links",
          severity: "low",
          message: "Aucun lien vers la fiche Google ou les réseaux sociaux.",
          fix: "update_business avec links (fiche Google Business Profile, Instagram…).",
        });
      }
    }
  }

  if (!input.pageId) {
    // Legal pages: required for a professional site, and written by OpenFlow from the site itself.
    const legal = legalComponentOf(config.components);
    const shown = new Set(published.flatMap((page) => legalSectionsOf(page.data)));
    const create = (kind: "privacy" | "notice", title: string) =>
      legal
        ? `« Informations légales » : « Créer la page ». Ou create_page (« ${title} »), puis add_section « ${legal} » avec legalDocument: "${kind}", et publish. Le texte s'écrit tout seul d'après le site.`
        : "Le site n'a pas de section « Informations légales » : demandez-la à la personne qui a créé le site.";
    if (!shown.has("privacy")) {
      add({
        code: "legal-privacy",
        severity: "high",
        message:
          "Pas de politique de confidentialité en ligne : elle est obligatoire dès qu'un site traite des données personnelles (visites, formulaires).",
        fix: create("privacy", "Politique de confidentialité"),
      });
    }
    if (!shown.has("notice")) {
      add({
        code: "legal-notice",
        severity: "high",
        message:
          "Pas de mentions légales en ligne : elles sont obligatoires pour un site professionnel (éditeur, hébergeur).",
        fix: create("notice", "Mentions légales"),
      });
    }
    if (input.settings) {
      const linked = linkedPageIds(input.settings);
      for (const page of published) {
        const kinds = legalSectionsOf(page.data);
        if (kinds.length === 0 || linked.has(page.id)) continue;
        add({
          code: "legal-link",
          severity: "medium",
          page: { id: page.id, title: page.title, path: slugToPath(page.slug) },
          message: `La page « ${page.title} » n'est liée ni depuis le menu ni depuis le bas de page : les visiteurs ne la trouvent pas.`,
          fix: "« Menu et pied de page » : ajoutez un lien vers cette page en bas de page (ou update_settings sur le champ de liens du pied de page).",
        });
      }
    }
    const gaps = legalGaps({ legal: site.legal, business: site.business, siteName: site.name });
    if (gaps.length > 0) {
      add({
        code: "legal-info",
        severity: "medium",
        message: `Informations légales incomplètes : ${gaps.join(", ")}.`,
        fix: "« Informations légales », ou update_legal (publisher, registration, director, privacyEmail…).",
      });
    }
  }

  const titles = new Map<string, AuditPage[]>();
  const descriptions = new Map<string, AuditPage[]>();
  for (const page of audited) {
    const ref = { id: page.id, title: page.title, path: slugToPath(page.slug) };
    const collection = page.collection ? config.collections?.[page.collection] : undefined;
    const entry = collection
      ? collectionEntry({ ...page, data: page.data }, collection, config)
      : undefined;
    const indexed = !page.seo?.noindex;

    const description = page.seo?.description?.trim() || entry?.description?.trim() || "";
    if (indexed && !description) {
      add({
        code: "page-description",
        severity: "high",
        page: ref,
        message: "Pas de description : Google et les IA en inventent une à partir du texte.",
        fix: "update_page avec seo.description : 120 à 155 caractères, qui disent ce que la page apporte (rédigez-la à partir du contenu de la page).",
      });
    } else if (indexed && page.seo?.description) {
      const length = page.seo.description.trim().length;
      if (length > 160 || length < 50) {
        add({
          code: "page-description-length",
          severity: "low",
          page: ref,
          message: `Description de ${length} caractères (idéal : 120 à 155).`,
          fix: "update_page avec une seo.description de 120 à 155 caractères.",
        });
      }
    }
    const title = (page.seo?.title || page.title).trim();
    if (indexed && title.length > 60) {
      add({
        code: "page-title-length",
        severity: "low",
        page: ref,
        message: `Titre de ${title.length} caractères : Google le coupe au-delà d'environ 60.`,
        fix: "update_page avec un seo.title plus court (50 à 60 caractères).",
      });
    }
    if (indexed) {
      titles.set(title.toLowerCase(), [...(titles.get(title.toLowerCase()) ?? []), page]);
      if (page.seo?.description) {
        const key = page.seo.description.trim().toLowerCase();
        descriptions.set(key, [...(descriptions.get(key) ?? []), page]);
      }
    }

    const data = applyDefaults(page.data, config);
    const text = pageText(data, config, site.lang);
    // A legal page's text is written by OpenFlow, outside the page's fields.
    if (indexed && words(text) < 80 && legalSectionsOf(page.data).length === 0) {
      add({
        code: "page-thin",
        severity: "low",
        page: ref,
        message: `Page très courte (${words(text)} mots) : les IA citent des pages qui répondent vraiment à une question.`,
        fix: "Ajoutez un paragraphe utile : ce que vous proposez, pour qui, où, à quel prix, les questions fréquentes (update_section ou add_section).",
      });
    }
    if (collection?.dateField && !entry?.date) {
      add({
        code: "item-date",
        severity: "medium",
        page: ref,
        message: "Élément sans date de publication.",
        fix: `update_section sur la section « ${collection.component} » de l'élément : champ ${collection.dateField} (AAAA-MM-JJ).`,
      });
    }
    if (collection?.imageField && !entry?.image?.src) {
      add({
        code: "item-image",
        severity: "low",
        page: ref,
        message:
          "Élément sans image : les listes et les partages sur les réseaux s'affichent sans visuel.",
        fix: `Choisissez une image dans le champ ${collection.imageField} (import_media puis update_section).`,
      });
    }
    if (page.updatedAt && !page.collection) {
      const age = (Date.parse(input.today) - Date.parse(page.updatedAt)) / 86_400_000;
      if (age > 365) {
        add({
          code: "page-stale",
          severity: "low",
          page: ref,
          message: `Page inchangée depuis ${Math.floor(age / 30)} mois : les assistants IA préfèrent les informations récentes.`,
          fix: "Relisez la page (prix, horaires, offres) et mettez-la à jour.",
        });
      }
    }

    walkComponents(data, (item) => {
      const fields = config.components[item.type]?.fields as Fields | undefined;
      const props = item.props as Record<string, unknown>;
      const section = typeof props.id === "string" ? props.id : undefined;
      for (const { kind, path, value } of valuesOf(fields, props)) {
        if (kind === "image" && isImage(value) && value.src && !value.alt?.trim()) {
          add({
            code: "image-alt",
            severity: "medium",
            page: ref,
            section,
            field: path,
            message: `Image sans texte alternatif (${value.src.split("/").pop()?.split("?")[0] ?? "image"}).`,
            fix: `update_section { pageId: "${page.id}", sectionId: "${section}", changes: { "${path}": { "src": "${value.src}", "alt": "…" } } } : décrivez l'image en une phrase (ce qu'elle montre), pour les malvoyants, Google et les IA.`,
          });
        }
        if (kind === "link" && isPageLink(value) && !publishedIds.has(value.pageId)) {
          const deleted = !knownIds.has(value.pageId);
          add({
            code: "link-broken",
            severity: "high",
            page: ref,
            section,
            field: path,
            message: deleted
              ? "Lien vers une page supprimée."
              : "Lien vers une page masquée : les visiteurs tomberont sur une erreur.",
            fix: `update_section { pageId: "${page.id}", sectionId: "${section}" } : choisissez une autre page pour ${path}${deleted ? "" : ", ou rendez la page visible (update_page, status published)"}.`,
          });
        }
      }
    });
  }

  for (const [, pages] of titles) {
    if (pages.length < 2) continue;
    add({
      code: "duplicate-title",
      severity: "medium",
      message: `${pages.length} pages ont le même titre : « ${(pages[0]?.seo?.title || pages[0]?.title) ?? ""} ».`,
      fix: `update_page : donnez un titre distinct à ${pages.map((p) => slugToPath(p.slug)).join(", ")}.`,
    });
  }
  for (const [, pages] of descriptions) {
    if (pages.length < 2) continue;
    add({
      code: "duplicate-description",
      severity: "low",
      message: `${pages.length} pages ont la même description.`,
      fix: `update_page : une description propre à chaque page (${pages.map((p) => slugToPath(p.slug)).join(", ")}).`,
    });
  }

  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  const penalty = findings.reduce((sum, f) => sum + WEIGHTS[f.severity], 0);
  return {
    score: Math.max(0, 100 - penalty),
    counts,
    findings,
    pagesChecked: audited.length,
  };
}
