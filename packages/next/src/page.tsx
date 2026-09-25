import {
  applyDefaults,
  findPage,
  type OpenFlowConfig,
  paramsToSlug,
  type Snapshot,
  type SnapshotPage,
  slugToParams,
} from "@openflow/core";
import { Render } from "@puckeditor/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation.js";
import { getSnapshot } from "./snapshot.js";
import { pageUrl } from "./urls.js";

type Params = Promise<{ slug?: string[] }>;

/** Next.js metadata of a page from its SEO fields and the site defaults. */
export function buildMetadata(site: Snapshot["site"], page: SnapshotPage): Metadata {
  const title = page.seo.title || page.title;
  const fullTitle = title.includes(site.name) ? title : `${title} | ${site.name}`;
  const description = page.seo.description || site.description;
  const url = pageUrl(site, page.slug);
  const image = page.seo.ogImage || site.ogImage;
  return {
    title: { absolute: fullTitle },
    description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: site.name,
      locale: site.lang,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
    robots: page.seo.noindex ? { index: false, follow: true } : undefined,
  };
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
    return page ? buildMetadata(snapshot.site, page) : {};
  }

  async function Page({ params }: { params: Params }) {
    const { snapshot, page } = await load(params);
    if (!page) notFound();
    return (
      <Render
        config={config}
        data={applyDefaults(page.data, config)}
        metadata={{
          site: snapshot.site,
          settings: snapshot.settings,
          page: { id: page.id, slug: page.slug, title: page.title },
        }}
      />
    );
  }

  return { generateStaticParams, generateMetadata, Page };
}
