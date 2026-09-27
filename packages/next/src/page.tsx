import {
  applyDefaults,
  buildCollections,
  buildPageCss,
  type CollectionEntry,
  FEED_PATH,
  findPage,
  itemEntry,
  jsonLdScript,
  type OpenFlowConfig,
  type OpenFlowMetadata,
  pageJsonLd,
  paramsToSlug,
  prepareRenderConfig,
  type Snapshot,
  type SnapshotPage,
  shareImageUrl,
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
  options: { feed?: boolean } = {},
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
        ? { type: "article", ...(entry.date ? { publishedTime: entry.date } : {}) }
        : { type: "website" }),
      images: image ? [{ url: image }] : undefined,
    },
    robots: page.seo.noindex ? { index: false, follow: true } : undefined,
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

/**
 * Creates the catch-all page of an OpenFlow site (`app/(site)/[[...slug]]/page.tsx`):
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
    const page = findPage(snapshot, paramsToSlug(slug));
    return { snapshot, page };
  }

  async function generateStaticParams() {
    const snapshot = await getSnapshot(config);
    return snapshot.pages.map((page) => ({ slug: slugToParams(page.slug) }));
  }

  async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
    const { snapshot, page } = await load(params);
    if (!page) return {};
    const collections = collectionsOf(snapshot, config);
    return buildMetadata(snapshot.site, page, itemEntry(snapshot, page, config, collections), {
      // `app/rss.xml/route.ts` lists the collections' items (see `createRssFeed`).
      feed: Object.keys(config.collections ?? {}).length > 0,
    });
  }

  async function Page({ params }: { params: Params }) {
    const { snapshot, page } = await load(params);
    if (!page) notFound();
    // Free style of the sections (`_style`), hoisted into <head> by React.
    const css = buildPageCss(page.data);
    const collections = collectionsOf(snapshot, config);
    // What sections receive in `puck.metadata`: the site, the page, and every collection's items.
    const metadata: OpenFlowMetadata = {
      site: snapshot.site,
      settings: snapshot.settings,
      page: {
        id: page.id,
        slug: page.slug,
        title: page.title,
        ...(page.collection ? { collection: page.collection } : {}),
      },
      collections,
    };
    return (
      <>
        {css && (
          <style href={`openflow-page-${page.id}`} precedence="openflow">
            {css}
          </style>
        )}
        {pageJsonLd(snapshot, page, config, collections).map((item, index) => (
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
  }

  return { generateStaticParams, generateMetadata, Page };
}
