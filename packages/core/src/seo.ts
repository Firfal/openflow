import { businessJsonLd } from "./business.js";
import { buildCollections, type CollectionEntry, getCollectionConfig } from "./collections.js";
import type { OpenFlowConfig } from "./config.js";
import type { ImageValue } from "./fields.js";
import { slugToPath } from "./slug.js";
import type { Snapshot, SnapshotPage } from "./snapshot.js";

/**
 * What search engines and AI agents read besides the page itself: structured data (schema.org
 * JSON-LD) and the RSS feed of the collections. Built from the snapshot, like the pages.
 */

/** Absolute address of a path (or URL) of the site, when `site.url` is known. */
export function absoluteUrl(site: Snapshot["site"], pathOrUrl: string): string | undefined {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!site.url) return undefined;
  return new URL(pathOrUrl, site.url.endsWith("/") ? site.url : `${site.url}/`).toString();
}

/** The copy of an image to share (about 1200 px wide), or the image itself. */
export function shareImageUrl(image: ImageValue | null | undefined): string | undefined {
  if (!image?.src) return undefined;
  const variants = [...(image.variants ?? [])].sort((a, b) => a.width - b.width);
  return (variants.find((v) => v.width >= 1200) ?? variants.at(-1))?.url ?? image.src;
}

/** The entry of an item page (with its collection's settings), or `undefined` for a page. */
export function itemEntry(
  snapshot: Snapshot,
  page: SnapshotPage,
  config: OpenFlowConfig,
  collections = buildCollections(snapshot.pages, config),
): CollectionEntry | undefined {
  if (!getCollectionConfig(config, page.collection)) return undefined;
  return collections[page.collection as string]?.find((entry) => entry.id === page.id);
}

type JsonLd = Record<string, unknown>;

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/**
 * JSON-LD of a page: `WebSite` on the home page, `Article` for the items of a collection, and the
 * breadcrumb of every other page (home, then each parent page that exists).
 */
export function pageJsonLd(
  snapshot: Snapshot,
  page: SnapshotPage,
  config: OpenFlowConfig,
  collections = buildCollections(snapshot.pages, config),
): JsonLd[] {
  const { site } = snapshot;
  const out: JsonLd[] = [];
  const url = absoluteUrl(site, slugToPath(page.slug));
  if (page.slug === "") {
    // The business behind the site (Réglages > Établissement): contact, address, hours, closures.
    const business = businessJsonLd(site, {
      today: snapshot.createdAt.slice(0, 10),
      url,
      image: absoluteUrl(site, page.seo.ogImage || site.ogImage || "") ?? undefined,
    });
    out.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: site.name,
      ...(url ? { url } : {}),
      ...(site.description ? { description: site.description } : {}),
      inLanguage: site.lang,
      ...(business?.["@id"] ? { publisher: { "@id": business["@id"] } } : {}),
    });
    if (business) out.push(business);
    return out;
  }
  const entry = itemEntry(snapshot, page, config, collections);
  if (entry) {
    const image = absoluteUrl(site, shareImageUrl(entry.image) ?? page.seo.ogImage ?? "");
    const publisher = {
      "@type": "Organization",
      name: site.name,
      ...(site.url ? { url: absoluteUrl(site, "/") } : {}),
    };
    out.push({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: clip(page.seo.title || entry.title, 110),
      ...((page.seo.description || entry.description) && {
        description: page.seo.description || entry.description,
      }),
      ...(image ? { image: [image] } : {}),
      ...(entry.date ? { datePublished: entry.date } : {}),
      ...(url ? { mainEntityOfPage: url, url } : {}),
      inLanguage: site.lang,
      author: publisher,
      publisher,
    });
  }
  if (site.url) {
    const bySlug = new Map(snapshot.pages.map((p) => [p.slug, p]));
    const trail: Array<{ name: string; slug: string }> = [];
    const home = bySlug.get("");
    trail.push({ name: home?.title || site.name, slug: "" });
    const segments = page.slug.split("/");
    for (let n = 1; n < segments.length; n++) {
      const parent = bySlug.get(segments.slice(0, n).join("/"));
      if (parent) trail.push({ name: parent.title, slug: parent.slug });
    }
    trail.push({ name: entry?.title ?? page.title, slug: page.slug });
    out.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((step, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: step.name,
        item: absoluteUrl(site, slugToPath(step.slug)),
      })),
    });
  }
  return out;
}

/** JSON for a `<script type="application/ld+json">`, safe inside HTML. */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

const escapeXml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function imageType(url: string): string {
  const ext = /\.(webp|png|gif|avif|jpe?g|svg)(?:[?#]|$)/i.exec(decodeURIComponent(url))?.[1];
  const type = ext?.toLowerCase().replace("jpg", "jpeg").replace("svg", "svg+xml");
  return `image/${type ?? "jpeg"}`;
}

/** Address of the RSS feed of the site (`app/rss.xml/route.ts`). */
export const FEED_PATH = "/rss.xml";

/**
 * RSS 2.0 feed of the site's collections (articles, events…), newest first: read by feed readers,
 * newsletter tools and AI agents. Items without a date come last; `noindex` items are left out.
 */
export function buildRssFeed(snapshot: Snapshot, config: OpenFlowConfig, limit = 50): string {
  const { site } = snapshot;
  const hidden = new Set(snapshot.pages.filter((p) => p.seo.noindex).map((p) => p.id));
  const collections = buildCollections(snapshot.pages, config);
  const entries = Object.values(collections)
    .flat()
    .filter((entry) => !hidden.has(entry.id))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, limit);
  const link = (path: string) => escapeXml(absoluteUrl(site, path) ?? path);
  const labels = Object.values(config.collections ?? {}).map((c) => c.label);
  const items = entries.map((entry) => {
    const lines = [
      "    <item>",
      `      <title>${escapeXml(entry.title)}</title>`,
      `      <link>${link(entry.href)}</link>`,
      `      <guid isPermaLink="${site.url ? "true" : "false"}">${link(entry.href)}</guid>`,
    ];
    if (entry.date) {
      const [y, m, d] = entry.date.split("-").map(Number) as [number, number, number];
      lines.push(`      <pubDate>${new Date(Date.UTC(y, m - 1, d, 8)).toUTCString()}</pubDate>`);
    }
    const label = config.collections?.[entry.collection]?.label;
    if (label) lines.push(`      <category>${escapeXml(label)}</category>`);
    if (entry.description) {
      lines.push(`      <description>${escapeXml(entry.description)}</description>`);
    }
    const image = absoluteUrl(site, shareImageUrl(entry.image) ?? "");
    if (image) {
      lines.push(
        `      <enclosure url="${escapeXml(image)}" length="0" type="${imageType(image)}"/>`,
      );
    }
    lines.push("    </item>");
    return lines.join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(labels.length === 1 ? `${site.name} : ${labels[0]}` : site.name)}</title>`,
    `    <link>${link("/")}</link>`,
    `    <description>${escapeXml(site.description || site.name)}</description>`,
    `    <language>${escapeXml(site.lang)}</language>`,
    ...(site.url
      ? [`    <atom:link href="${link(FEED_PATH)}" rel="self" type="application/rss+xml"/>`]
      : []),
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
