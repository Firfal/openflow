import type { OpenFlowConfig } from "./config.js";
import {
  applyPageTranslation,
  applySettingsTranslation,
  languageLabel,
  localizedSlug,
} from "./i18n.js";
import { slugToPath } from "./slug.js";
import type { Snapshot, SnapshotPage } from "./snapshot.js";
import { resolvePageLinks } from "./walk.js";

/**
 * The published site in each of its languages. The default language is the snapshot itself; each
 * other language (`site.locales`) is a snapshot of the pages translated into it, at
 * `/<lang>/<address>/`, whose links lead to the translated pages (or to the default language's
 * page when a page is not translated).
 */

export interface SiteVersion {
  locale: string;
  /** The default language (the snapshot as published). */
  main: boolean;
  snapshot: Snapshot;
}

/** The site in one of its other languages. */
export function localizeSnapshot(
  snapshot: Snapshot,
  locale: string,
  config: Pick<OpenFlowConfig, "components" | "settings">,
): Snapshot {
  const translated = snapshot.pages.filter((page) => page.translations?.[locale]);
  const slugOf = (page: SnapshotPage) =>
    localizedSlug(page.translations?.[locale]?.slug ?? page.slug, locale);
  const hrefByPageId = new Map(snapshot.pages.map((page) => [page.id, slugToPath(page.slug)]));
  for (const page of translated) hrefByPageId.set(page.id, slugToPath(slugOf(page)));
  const pages: SnapshotPage[] = translated.map((page) => {
    const { translations, ...rest } = page;
    const translation = translations?.[locale];
    return {
      ...rest,
      slug: slugOf(page),
      title: translation?.title || page.title,
      seo: {
        ...page.seo,
        ...(translation?.seo?.title ? { title: translation.seo.title } : {}),
        ...(translation?.seo?.description ? { description: translation.seo.description } : {}),
      },
      data: resolvePageLinks(
        applyPageTranslation(page.data, config, translation?.values),
        hrefByPageId,
      ),
    };
  });
  const common = snapshot.settingsTranslations?.[locale];
  return {
    ...snapshot,
    site: {
      ...snapshot.site,
      lang: locale,
      name: common?.site?.name || snapshot.site.name,
      ...(common?.site?.description || snapshot.site.description
        ? { description: common?.site?.description || snapshot.site.description }
        : {}),
    },
    settings: resolvePageLinks(
      applySettingsTranslation(snapshot.settings, config, common?.values),
      hrefByPageId,
    ),
    pages,
  };
}

/** The site in each of its languages, the default one first. */
export function siteVersions(
  snapshot: Snapshot,
  config: Pick<OpenFlowConfig, "components" | "settings">,
): SiteVersion[] {
  const versions: SiteVersion[] = [{ locale: snapshot.site.lang, main: true, snapshot }];
  for (const locale of snapshot.site.locales ?? []) {
    versions.push({ locale, main: false, snapshot: localizeSnapshot(snapshot, locale, config) });
  }
  return versions;
}

/** The page at an address, in whichever language it belongs to. */
export function findVersionPage(
  versions: SiteVersion[],
  slug: string,
): { version: SiteVersion; page: SnapshotPage } | undefined {
  for (const version of versions) {
    const page = version.snapshot.pages.find((p) => p.slug === slug);
    if (page) return { version, page };
  }
  return undefined;
}

/** A page in each language it exists in (`hreflang`, language switcher). */
export function pageAlternates(
  versions: SiteVersion[],
  pageId: string,
): Array<{ locale: string; slug: string }> {
  const out: Array<{ locale: string; slug: string }> = [];
  for (const version of versions) {
    const page = version.snapshot.pages.find((p) => p.id === pageId);
    if (page) out.push({ locale: version.locale, slug: page.slug });
  }
  return out;
}

export interface LanguageLink {
  /** `fr`, `en`… (the `lang` and `hreflang` of the link). */
  lang: string;
  /** The language's own name: « Français », « English ». */
  label: string;
  /** This page in that language, or that language's home page. */
  href: string;
  current: boolean;
}

/**
 * The language switcher of a page: every language of the site, pointing to this page when it is
 * translated, to the language's home page otherwise (languages without a home page are left out).
 */
export function languageLinks(
  versions: SiteVersion[],
  pageId: string,
  current: string,
): LanguageLink[] {
  if (versions.length < 2) return [];
  const links: LanguageLink[] = [];
  for (const version of versions) {
    const page =
      version.snapshot.pages.find((p) => p.id === pageId) ??
      version.snapshot.pages.find((p) => p.slug === (version.main ? "" : version.locale));
    if (!page) continue;
    links.push({
      lang: version.locale,
      label: languageLabel(version.locale),
      href: slugToPath(page.slug),
      current: version.locale === current,
    });
  }
  return links.length > 1 ? links : [];
}

/** Addresses of every published page, in every language (no config needed: server side). */
export function publishedPaths(snapshot: Snapshot): string[] {
  const paths = snapshot.pages.map((page) => slugToPath(page.slug));
  for (const locale of snapshot.site.locales ?? []) {
    for (const page of snapshot.pages) {
      const translation = page.translations?.[locale];
      if (translation) paths.push(slugToPath(localizedSlug(translation.slug ?? page.slug, locale)));
    }
  }
  return paths;
}

/**
 * The published page at an address, in whichever language, with the texts of that language
 * (server side, e.g. the forms: their labels are translated).
 */
export function pageAtPath(
  snapshot: Snapshot,
  path: string,
): { page: SnapshotPage; locale?: string; values?: Record<string, string> } | undefined {
  const target = path.endsWith("/") ? path : `${path}/`;
  const page = snapshot.pages.find((p) => slugToPath(p.slug) === target);
  if (page) return { page };
  for (const locale of snapshot.site.locales ?? []) {
    for (const p of snapshot.pages) {
      const translation = p.translations?.[locale];
      if (translation && slugToPath(localizedSlug(translation.slug ?? p.slug, locale)) === target) {
        return { page: p, locale, values: translation.values };
      }
    }
  }
  return undefined;
}
