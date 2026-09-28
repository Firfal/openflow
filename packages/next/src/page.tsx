import {
  applyDefaults,
  buildCollections,
  buildPageCss,
  type CollectionEntry,
  FEED_PATH,
  findVersionPage,
  itemEntry,
  jsonLdScript,
  type LegalDocuments,
  languageLinks,
  legalDocuments,
  legalFacts,
  legalSectionsOf,
  type OpenFlowConfig,
  type OpenFlowMetadata,
  pageAlternates,
  pageJsonLd,
  paramsToSlug,
  prepareRenderConfig,
  type SiteVersion,
  type Snapshot,
  type SnapshotPage,
  shareImageUrl,
  siteVersions,
  slugToParams,
} from "@openflow/core";
import { Render } from "@puckeditor/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation.js";
import { getSnapshot } from "./snapshot.js";
import { pageUrl } from "./urls.js";

type Params = Promise<{ slug?: string[] }>;

/**
 * Next.js metadata of a page from its SEO fields and the site defaults. An item of a collection
 * (`entry`) is an article: its description and image are the default ones, with its date.
 */
export function buildMetadata(
  site: Snapshot["site"],
  page: SnapshotPage,
  entry?: CollectionEntry,
  options: {
    feed?: boolean;
    /** The page in each language of the site (`hreflang`). */
    alternates?: Array<{ locale: string; slug: string }>;
  } = {},
): Metadata {
  const title = page.seo.title || page.title;
  const fullTitle = title.includes(site.name) ? title : `${title} | ${site.name}`;
  const description = page.seo.description || entry?.description || site.description;
  const url = pageUrl(site, page.slug);
  const shared = page.seo.ogImage || shareImageUrl(entry?.image) || site.ogImage;
  // A relative image needs the site's address (otherwise Next.js would resolve it on localhost).
  const image = shared && (/^https?:\/\//i.test(shared) || site.url) ? shared : undefined;
  return {
    ...(site.url ? { metadataBase: new URL(site.url) } : {}),
    title: { absolute: fullTitle },
    description,
    alternates: {
      ...(url ? { canonical: url } : {}),
      ...(site.url && (options.alternates?.length ?? 0) > 1
        ? {
            languages: Object.fromEntries([
              ...options.alternates!.map((alt) => [alt.locale, pageUrl(site, alt.slug)!]),
              // The default language's page for any other visitor.
              ["x-default", pageUrl(site, options.alternates![0]!.slug)!],
            ]),
          }
        : {}),
      ...(options.feed
        ? { types: { "application/rss+xml": [{ url: FEED_PATH, title: site.name }] } }
        : {}),
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: site.name,
      locale: site.lang,
      ...(entry
        ? {
            type: "article",
            ...(entry.date ? { publishedTime: entry.date } : {}),
            ...(page.updatedAt ? { modifiedTime: page.updatedAt } : {}),
          }
        : { type: "website" }),
      images: image ? [{ url: image }] : undefined,
    },
    robots: page.seo.noindex ? { index: false, follow: true } : undefined,
    // Search Console and Bing Webmaster Tools check the home page's tags.
    ...(page.slug === "" && site.verification
      ? {
          verification: {
            ...(site.verification.google ? { google: site.verification.google } : {}),
            ...(site.verification.bing
              ? { other: { "msvalidate.01": site.verification.bing } }
              : {}),
          },
        }
      : {}),
  };
}

/** The collections of a snapshot, computed once per build (every page lists the same items). */
const collectionsCache = new WeakMap<Snapshot, Record<string, CollectionEntry[]>>();
function collectionsOf(snapshot: Snapshot, config: OpenFlowConfig) {
  let collections = collectionsCache.get(snapshot);
  if (!collections) {
    collections = buildCollections(snapshot.pages, config);
    collectionsCache.set(snapshot, collections);
  }
  return collections;
}

/** The site in each of its languages, computed once per build (`siteVersions`). */
const versionsCache = new WeakMap<Snapshot, SiteVersion[]>();
export function versionsOf(snapshot: Snapshot, config: OpenFlowConfig): SiteVersion[] {
  let versions = versionsCache.get(snapshot);
  if (!versions) {
    versions = siteVersions(snapshot, config);
    versionsCache.set(snapshot, versions);
  }
  return versions;
}

/**
 * The legal pages of a language of the site (privacy policy, legal notice), written from what the
 * published site does; computed once per build.
 */
const legalCache = new WeakMap<Snapshot, LegalDocuments>();
function legalOf(version: Snapshot, main: Snapshot) {
  let documents = legalCache.get(version);
  if (!documents) {
    documents = legalDocuments(
      legalFacts({
        site: version.site,
        // This language's pages first (links to its legal pages), then the whole site (forms).
        pages: version === main ? main.pages : [...version.pages, ...main.pages],
        integrations: version.integrations,
        date: version.createdAt,
      }),
    );
    legalCache.set(version, documents);
  }
  return documents;
}

/**
 * Creates the catch-all page of an OpenFlow site (`app/(site)/[[...slug]]/page.tsx`), in every
 * language of the site (`/`, `/en/`…), inside the site's layout (`config.layout`):
 *
 * ```tsx
 * const site = createOpenFlowPage(config);
 * export const dynamicParams = false;
 * export const generateStaticParams = site.generateStaticParams;
 * export const generateMetadata = site.generateMetadata;
 * export default site.Page;
 * ```
 */
export function createOpenFlowPage(config: OpenFlowConfig) {
  // Same element markers as in the editor (`data-of`, `data-of-s`): style rules target them.
  const renderConfig = prepareRenderConfig(config);
  async function load(params: Params) {
    const { slug } = await params;
    const snapshot = await getSnapshot(config);
    const versions = versionsOf(snapshot, config);
    const found = findVersionPage(versions, paramsToSlug(slug));
    return { snapshot, versions, version: found?.version, page: found?.page };
  }

  async function generateStaticParams() {
    const snapshot = await getSnapshot(config);
    return versionsOf(snapshot, config).flatMap((version) =>
      version.snapshot.pages.map((page) => ({ slug: slugToParams(page.slug) })),
    );
  }

  async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
    const { versions, version, page } = await load(params);
    if (!page || !version) return {};
    const localized = version.snapshot;
    const collections = collectionsOf(localized, config);
    return buildMetadata(localized.site, page, itemEntry(localized, page, config, collections), {
      // `app/rss.xml/route.ts` lists the collections' items (see `createRssFeed`).
      feed: version.main && Object.keys(config.collections ?? {}).length > 0,
      alternates: pageAlternates(versions, page.id),
    });
  }

  async function Page({ params }: { params: Params }) {
    const { snapshot, versions, version, page } = await load(params);
    if (!page || !version) notFound();
    const localized = version.snapshot;
    // Free style of the sections (`_style`), hoisted into <head> by React.
    const css = buildPageCss(page.data);
    const collections = collectionsOf(localized, config);
    // What sections receive in `puck.metadata`: the site, the page, and every collection's items.
    const metadata: OpenFlowMetadata = {
      site: localized.site,
      settings: localized.settings,
      locale: version.locale,
      page: {
        id: page.id,
        slug: page.slug,
        title: page.title,
        ...(page.collection ? { collection: page.collection } : {}),
      },
      collections,
      // Only the pages showing a legal document get them (`getLegalDocument`).
      ...(legalSectionsOf(page.data).length > 0 ? { legal: legalOf(localized, snapshot) } : {}),
    };
    const content = (
      <>
        {css && (
          <style href={`openflow-page-${page.id}`} precedence="openflow">
            {css}
          </style>
        )}
        {pageJsonLd(localized, page, config, collections).map((item, index) => (
          <script
            key={index}
            type="application/ld+json"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON escaped by jsonLdScript.
            dangerouslySetInnerHTML={{ __html: jsonLdScript(item) }}
          />
        ))}
        <Render config={renderConfig} data={applyDefaults(page.data, config)} metadata={metadata} />
      </>
    );
    const Layout = config.layout;
    const framed = Layout ? (
      <Layout
        settings={{ ...(config.settings?.defaultProps ?? {}), ...localized.settings }}
        site={localized.site}
        languages={languageLinks(versions, page.id, version.locale)}
        homeHref={
          localized.pages.some((p) => p.slug === version.locale) ? `/${version.locale}/` : "/"
        }
      >
        {content}
      </Layout>
    ) : (
      content
    );
    if (version.main) return framed;
    // A page in another language: its language for assistive technologies, search engines and
    // the browser (the document's <html lang> is the default language's).
    return (
      <div lang={version.locale} style={{ display: "contents" }}>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant language code.
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.lang=${JSON.stringify(version.locale)}`,
          }}
        />
        {framed}
      </div>
    );
  }

  return { generateStaticParams, generateMetadata, Page };
}
