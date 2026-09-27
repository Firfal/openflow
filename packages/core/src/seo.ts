import { businessJsonLd, postalAddress } from "./business.js";
import { buildCollections, type CollectionEntry, getCollectionConfig } from "./collections.js";
import type { CollectionConfig, OpenFlowConfig } from "./config.js";
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
 * A price as written by the owner, for schema.org: « 25 », « 12,50 € », « à partir de 30 € »,
 * « Gratuit » (0). `undefined` when there is no amount (« Sur devis »).
 */
export function parsePrice(
  text: string | undefined,
): { price: number; currency: string } | undefined {
  if (!text) return undefined;
  const currency = /\$|usd/i.test(text)
    ? "USD"
    : /£|gbp/i.test(text)
      ? "GBP"
      : /chf/i.test(text)
        ? "CHF"
        : "EUR";
  if (/gratuit|free|offert/i.test(text)) return { price: 0, currency };
  const match = /(\d[\d\s\u00a0\u202f]*)(?:[.,](\d{1,2}))?/.exec(text);
  if (!match) return undefined;
  const units = Number(match[1]?.replace(/[\s\u00a0\u202f]/g, ""));
  const price = match[2] ? Number(`${units}.${match[2].padEnd(2, "0")}`) : units;
  return Number.isFinite(price) ? { price, currency } : undefined;
}

/** « 10:00 », « 10h », « 14 h 30 » → `10:00`, `14:30`. */
export function parseTime(text: string | undefined): string | undefined {
  const match = text ? /^\s*(\d{1,2})\s*(?:[:h]\s*(\d{2})?)?\s*$/i.exec(text) : null;
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return undefined;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** schema.org data of a collection item, by its collection's `kind`. */
function itemJsonLd(
  snapshot: Snapshot,
  page: SnapshotPage,
  entry: CollectionEntry,
  collection: CollectionConfig,
  url: string | undefined,
): JsonLd {
  const { site } = snapshot;
  const image = absoluteUrl(site, shareImageUrl(entry.image) ?? page.seo.ogImage ?? "");
  const description = page.seo.description || entry.description;
  const home = absoluteUrl(site, "/");
  // The business of Réglages > Établissement (its JSON-LD is on the home page), or the site.
  const organization =
    site.business && home
      ? { "@id": `${home}#business` }
      : { "@type": "Organization", name: site.name, ...(home ? { url: home } : {}) };
  const common = {
    "@context": "https://schema.org",
    name: clip(entry.title, 110),
    ...(description ? { description } : {}),
    ...(image ? { image: [image] } : {}),
    ...(url ? { url } : {}),
    inLanguage: site.lang,
  };
  const amount = parsePrice(entry.price);
  const offer = (extra: JsonLd = {}) =>
    amount
      ? {
          offers: {
            "@type": "Offer",
            price: amount.price,
            priceCurrency: amount.currency,
            availability: "https://schema.org/InStock",
            ...(url ? { url } : {}),
            ...extra,
          },
        }
      : {};
  switch (collection.kind) {
    case "event": {
      const time = parseTime(entry.time);
      const address = postalAddress(site.business);
      // A place of its own is written by the owner (its address as text); otherwise the business.
      const place = entry.location
        ? { "@type": "Place", name: entry.location, address: entry.location }
        : address
          ? { "@type": "Place", name: site.business?.name || site.name, address }
          : undefined;
      return {
        ...common,
        "@type": "Event",
        ...(entry.date ? { startDate: time ? `${entry.date}T${time}` : entry.date } : {}),
        ...(entry.endDate ? { endDate: entry.endDate } : {}),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        ...(place ? { location: place } : {}),
        organizer: organization,
        ...(amount?.price === 0 ? { isAccessibleForFree: true } : {}),
        ...offer(),
      };
    }
    case "service":
      return {
        ...common,
        "@type": "Service",
        provider: organization,
        ...(site.business?.areaServed || site.business?.city
          ? { areaServed: site.business.areaServed || site.business.city }
          : {}),
        ...offer(),
      };
    case "product":
      return { ...common, "@type": "Product", brand: organization, ...offer() };
    default:
      return {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: clip(page.seo.title || entry.title, 110),
        ...(description ? { description } : {}),
        ...(image ? { image: [image] } : {}),
        ...(entry.date ? { datePublished: entry.date } : {}),
        ...(page.updatedAt ? { dateModified: page.updatedAt } : {}),
        ...(url ? { mainEntityOfPage: url, url } : {}),
        inLanguage: site.lang,
        author: { "@type": "Organization", name: site.name, ...(home ? { url: home } : {}) },
        publisher: { "@type": "Organization", name: site.name, ...(home ? { url: home } : {}) },
      };
  }
}

/**
 * JSON-LD of a page: `WebSite` on the home page, `Article`, `Event`, `Service` or `Product` for the
 * items of a collection (its `kind`), and the
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
  const collection = getCollectionConfig(config, page.collection);
  if (entry && collection) out.push(itemJsonLd(snapshot, page, entry, collection, url));
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

/**
 * Crawlers that collect content to train AI models: refused in robots.txt when the owner chooses so
 * (`site.aiTraining: "block"`, Réglages > Site et référencement). Names from each operator's docs.
 */
export const AI_TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
  "Bytespider",
];

/** Crawlers of AI search and assistants (they cite and link the site): always allowed. */
export const AI_SEARCH_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
];

/** Where the site serves its IndexNow key (`app/indexnow.txt/route.ts`). */
export const INDEXNOW_PATH = "/indexnow.txt";

/**
 * Absolute addresses of the pages changed since `since` (every page without it), indexable only,
 * for IndexNow. Empty without `site.url`.
 */
export function changedUrls(snapshot: Snapshot, since?: string): string[] {
  const { site } = snapshot;
  if (!site.url) return [];
  return snapshot.pages
    .filter((page) => !page.seo.noindex)
    .filter((page) => !since || !page.updatedAt || page.updatedAt > since)
    .map((page) => absoluteUrl(site, slugToPath(page.slug)))
    .filter((url): url is string => Boolean(url));
}
