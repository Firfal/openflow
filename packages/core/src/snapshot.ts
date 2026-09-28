import type { Data } from "@puckeditor/core";
import { z } from "zod";
import { businessSchema, sanitizeBusiness } from "./business-schema.js";
import { localizedSlug, type PageTranslation, siteLocales } from "./i18n.js";
import { sanitizeLegal } from "./legal.js";
import type { IntegrationsDoc, PageDoc, SettingsDoc, SiteSettings } from "./model.js";
import { sanitizeVerification } from "./search-console.js";
import { isValidSlug, slugToPath } from "./slug.js";
import { sanitizePageStyles, sanitizeTheme } from "./style.js";
import { ensureIds, resolvePageLinks } from "./walk.js";

export const SNAPSHOT_VERSION = 1;

const componentSchema = z.looseObject({
  type: z.string().min(1),
  props: z.record(z.string(), z.unknown()),
});

/** Structural schema of Puck page data (props are validated against the config separately). */
export const pageDataSchema = z.looseObject({
  root: z
    .looseObject({ props: z.record(z.string(), z.unknown()).optional() })
    .default({ props: {} }),
  content: z.array(componentSchema).default([]),
  zones: z.record(z.string(), z.array(componentSchema)).optional(),
});

export const seoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  ogImage: z.string().optional(),
  noindex: z.boolean().optional(),
});

export const slugSchema = z
  .string()
  .refine(isValidSlug, "Slug invalide : minuscules, chiffres et tirets, séparés par « / »");

export const siteSettingsSchema = z.object({
  name: z.string().min(1),
  lang: z.string().min(2).default("fr"),
  url: z.string().url().optional(),
  description: z.string().optional(),
  ogImage: z.string().optional(),
  gaMeasurementId: z
    .string()
    .regex(/^G-[A-Z0-9]{4,20}$/, "Identifiant Google Analytics : G-XXXXXXX")
    .optional()
    .catch(undefined),
  business: businessSchema.optional().catch(undefined),
  aiTraining: z.enum(["allow", "block"]).optional().catch(undefined),
  stats: z.enum(["on", "off"]).optional().catch(undefined),
  legal: z
    .object({
      publisher: z.string().optional(),
      legalForm: z.string().optional(),
      registration: z.string().optional(),
      vat: z.string().optional(),
      address: z.string().optional(),
      director: z.string().optional(),
      privacyEmail: z.string().optional(),
      mediator: z.string().optional(),
    })
    .optional()
    .catch(undefined),
  locales: z.array(z.string()).optional().catch(undefined),
  verification: z
    .object({ google: z.string().optional(), bing: z.string().optional() })
    .optional()
    .catch(undefined),
});

const texts = z.record(z.string(), z.string());

/** A page in another language, as published (`i18n.ts`). */
export const pageTranslationSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  seo: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
  values: texts.default({}),
});

export const snapshotPageSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  title: z.string().min(1),
  seo: seoSchema.default({}),
  /** Items of a collection (`config.collections`): the collection's name. */
  collection: z.string().optional(),
  /** Last change of the page (sitemap `lastmod`, `dateModified`). */
  updatedAt: z.string().optional(),
  /** The page in the site's other languages (`locale` → texts). */
  translations: z.record(z.string(), pageTranslationSchema).optional(),
  data: pageDataSchema,
});

export const snapshotSchema = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  releaseId: z.string().min(1),
  createdAt: z.string(),
  site: siteSettingsSchema,
  settings: z.record(z.string(), z.unknown()).default({}),
  /** Theme tokens (`:root` variables), e.g. `{ "color-ink": "#101820" }`. */
  theme: z.record(z.string(), z.string()).default({}),
  /** Public keys of the site's integrations (reCAPTCHA), from `cms_system/integrations`. */
  integrations: z
    .object({
      recaptchaSiteKey: z.string().optional(),
      indexNowKey: z.string().optional(),
      mail: z.literal("resend").optional().catch(undefined),
      region: z.string().optional(),
    })
    .default({}),
  pages: z.array(snapshotPageSchema),
  /** The common content and the site's name in the other languages. */
  settingsTranslations: z
    .record(
      z.string(),
      z.object({
        site: z
          .object({ name: z.string().optional(), description: z.string().optional() })
          .optional(),
        values: texts.default({}),
      }),
    )
    .optional(),
});

export type SnapshotPage = z.infer<typeof snapshotPageSchema> & { data: Data };
export type Snapshot = Omit<z.infer<typeof snapshotSchema>, "pages"> & { pages: SnapshotPage[] };

export interface SnapshotInput {
  releaseId: string;
  createdAt?: string;
  /** Public keys of the integrations (`cms_system/integrations`). */
  integrations?: Pick<IntegrationsDoc, "recaptchaSiteKey" | "indexNowKey" | "mail" | "region">;
  settings: Pick<SettingsDoc, "site" | "values" | "theme" | "translations">;
  pages: Array<
    Pick<PageDoc, "slug" | "title" | "status" | "seo" | "data" | "collection"> & {
      id: string;
      updatedAt?: string;
      /** The page's translations (`locale` → texts), from `cms_page_translations`. */
      translations?: Record<string, PageTranslation>;
    }
  >;
}

export class SnapshotError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "SnapshotError";
  }
}

/**
 * Freezes the published state of the site: keeps published pages only, assigns missing
 * component ids, re-resolves internal links from current slugs and checks slug uniqueness.
 */
export function createSnapshot(input: SnapshotInput): Snapshot {
  const published = input.pages.filter((page) => page.status === "published");
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const page of published) {
    if (!isValidSlug(page.slug))
      problems.push(`Page « ${page.title} » : slug invalide « ${page.slug} »`);
    const other = seen.get(page.slug);
    if (other !== undefined) {
      problems.push(
        `Pages « ${other} » et « ${page.title} » : même adresse ${slugToPath(page.slug)}`,
      );
    }
    seen.set(page.slug, page.title);
  }
  // The other languages live at /<lang>/: no page of the default language may use these addresses.
  const locales = siteLocales(input.settings.site);
  for (const page of published) {
    const first = page.slug.split("/")[0] ?? "";
    if (locales.includes(first)) {
      problems.push(
        `Page « ${page.title} » : l'adresse ${slugToPath(page.slug)} est réservée à la version « ${first} » du site`,
      );
    }
  }
  const translations = new Map<string, Record<string, PageTranslation>>();
  for (const locale of locales) {
    const taken = new Map<string, string>();
    for (const page of published) {
      const translation = cleanTranslation(page, page.translations?.[locale]);
      if (!translation) continue;
      translations.set(page.id, { ...(translations.get(page.id) ?? {}), [locale]: translation });
      const slug = localizedSlug(translation.slug ?? page.slug, locale);
      const other = taken.get(slug);
      if (other !== undefined) {
        problems.push(
          `Pages « ${other} » et « ${page.title} » : même adresse ${slugToPath(slug)} en « ${locale} »`,
        );
      }
      taken.set(slug, page.title);
    }
  }
  if (problems.length > 0) throw new SnapshotError("Publication impossible", problems);

  const hrefByPageId = new Map(input.pages.map((page) => [page.id, slugToPath(page.slug)]));
  const pages = published
    .map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      seo: page.seo ?? {},
      ...(page.collection ? { collection: page.collection } : {}),
      ...(page.updatedAt ? { updatedAt: page.updatedAt } : {}),
      ...(translations.has(page.id) ? { translations: translations.get(page.id) } : {}),
      // Styles are re-validated here: only whitelisted values reach the published CSS.
      data: sanitizePageStyles(resolvePageLinks(ensureIds(page.data), hrefByPageId)),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const ga = input.settings.site.gaMeasurementId?.trim().toUpperCase();
  const site: SiteSettings = {
    ...input.settings.site,
    lang: input.settings.site.lang || "fr",
    gaMeasurementId: ga && /^G-[A-Z0-9]{4,20}$/.test(ga) ? ga : undefined,
  };
  if (!site.gaMeasurementId) delete site.gaMeasurementId;
  // Only the valid parts of the business profile are published.
  const business = sanitizeBusiness(input.settings.site.business);
  if (business) site.business = business;
  else delete site.business;
  const recaptchaSiteKey = input.integrations?.recaptchaSiteKey;
  const indexNowKey = input.integrations?.indexNowKey;
  if (site.aiTraining !== "block") delete site.aiTraining;
  if (site.stats !== "off") delete site.stats;
  const legal = sanitizeLegal(input.settings.site.legal);
  if (legal) site.legal = legal;
  else delete site.legal;
  if (locales.length > 0) site.locales = locales;
  else delete site.locales;
  const verification = sanitizeVerification(input.settings.site.verification);
  if (verification) site.verification = verification;
  else delete site.verification;
  const settingsTranslations: NonNullable<Snapshot["settingsTranslations"]> = {};
  for (const locale of locales) {
    const translation = input.settings.translations?.[locale];
    if (!translation) continue;
    const name = translation.site?.name?.trim();
    const description = translation.site?.description?.trim();
    settingsTranslations[locale] = {
      ...(name || description
        ? { site: { ...(name ? { name } : {}), ...(description ? { description } : {}) } }
        : {}),
      values: onlyTexts(translation.values),
    };
  }
  const region = input.integrations?.region;
  return {
    version: SNAPSHOT_VERSION,
    releaseId: input.releaseId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    site,
    settings: resolvePageLinks(input.settings.values ?? {}, hrefByPageId),
    theme: sanitizeTheme(input.settings.theme),
    integrations: {
      ...(recaptchaSiteKey && /^[\w-]{20,60}$/.test(recaptchaSiteKey) ? { recaptchaSiteKey } : {}),
      ...(indexNowKey && /^[a-f0-9]{32}$/.test(indexNowKey) ? { indexNowKey } : {}),
      ...(input.integrations?.mail === "resend" ? { mail: "resend" as const } : {}),
      ...(region && /^[a-z0-9-]{2,40}$/.test(region) ? { region } : {}),
    },
    pages,
    ...(Object.keys(settingsTranslations).length > 0 ? { settingsTranslations } : {}),
  };
}

/** Keeps the string values of a translation. */
function onlyTexts(values: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!values || typeof values !== "object") return out;
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && key.length <= 300) out[key] = value;
  }
  return out;
}

/**
 * The published part of a page's translation: its title, address (not for the home page nor an
 * item of a collection, whose address follows its collection), description and texts.
 */
function cleanTranslation(
  page: Pick<PageDoc, "slug" | "collection">,
  translation: PageTranslation | undefined,
): PageTranslation | undefined {
  if (!translation || typeof translation !== "object") return undefined;
  const title = typeof translation.title === "string" ? translation.title.trim() : "";
  const slug =
    page.slug !== "" && !page.collection && translation.slug && isValidSlug(translation.slug)
      ? translation.slug
      : undefined;
  const seoTitle = translation.seo?.title?.trim();
  const seoDescription = translation.seo?.description?.trim();
  return {
    ...(title ? { title: title.slice(0, 200) } : {}),
    ...(slug ? { slug } : {}),
    ...(seoTitle || seoDescription
      ? {
          seo: {
            ...(seoTitle ? { title: seoTitle } : {}),
            ...(seoDescription ? { description: seoDescription } : {}),
          },
        }
      : {}),
    values: onlyTexts(translation.values),
  };
}

/** Parses and validates an unknown value (e.g. a JSON file) as a snapshot. */
export function parseSnapshot(value: unknown): Snapshot {
  const result = snapshotSchema.safeParse(value);
  if (!result.success) {
    throw new SnapshotError(
      "Snapshot invalide",
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  return result.data as Snapshot;
}

export function findPage(snapshot: Snapshot, slug: string): SnapshotPage | undefined {
  return snapshot.pages.find((page) => page.slug === slug);
}

/** A page added to the online site by a scheduled publication, as it is at that time. */
export type ScheduledPage = Pick<PageDoc, "slug" | "title" | "seo" | "data" | "collection"> & {
  id: string;
  updatedAt?: string;
  translations?: Record<string, PageTranslation>;
};

/**
 * Scheduled publication: the online site with pages added (or replaced) as they are now: a new snapshot built from the
 * online one, its links and lists (collections) including the new pages.
 */
export function addPagesToSnapshot(
  snapshot: Snapshot,
  pages: ScheduledPage[],
  release: { releaseId: string; createdAt: string },
): Snapshot {
  const added = new Set(pages.map((page) => page.id));
  const settingsTranslations = Object.fromEntries(
    Object.entries(snapshot.settingsTranslations ?? {}).map(([locale, translation]) => [
      locale,
      { ...translation, values: translation.values ?? {} },
    ]),
  );
  return createSnapshot({
    releaseId: release.releaseId,
    createdAt: release.createdAt,
    integrations: snapshot.integrations,
    settings: {
      site: snapshot.site,
      values: snapshot.settings,
      theme: snapshot.theme,
      ...(Object.keys(settingsTranslations).length > 0
        ? { translations: settingsTranslations }
        : {}),
    },
    pages: [
      ...snapshot.pages
        .filter((page) => !added.has(page.id))
        .map((page) => ({ ...page, status: "published" as const })),
      ...pages.map((page) => ({ ...page, status: "published" as const })),
    ],
  });
}
