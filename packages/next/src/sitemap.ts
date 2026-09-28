import {
  AI_TRAINING_BOTS,
  buildLlmsFullTxt,
  buildLlmsTxt,
  buildRssFeed,
  type OpenFlowConfig,
  pageAlternates,
  siteVersions,
} from "@openflow/core";
import type { MetadataRoute } from "next";
import { getSnapshot } from "./snapshot.js";
import { pageUrl } from "./urls.js";

/**
 * `app/sitemap.ts`:
 * ```ts
 * export const dynamic = "force-static";
 * export default createSitemap(config);
 * ```
 */
export function createSitemap(config: OpenFlowConfig) {
  return async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const snapshot = await getSnapshot(config);
    const versions = siteVersions(snapshot, config);
    const site = snapshot.site;
    return versions.flatMap((version) =>
      version.snapshot.pages
        .filter((page) => !page.seo.noindex)
        .map((page) => ({ url: pageUrl(site, page.slug), page }))
        .filter((entry): entry is { url: string; page: (typeof snapshot.pages)[number] } =>
          Boolean(entry.url),
        )
        .map(({ url, page }) => {
          // The same page in the site's other languages (`hreflang`).
          const alternates = pageAlternates(versions, page.id);
          return {
            url,
            // The page's own last change (search engines and AI assistants favour fresh pages).
            lastModified: page.updatedAt ?? snapshot.createdAt,
            ...(alternates.length > 1
              ? {
                  alternates: {
                    languages: Object.fromEntries(
                      alternates.map((alt) => [alt.locale, pageUrl(site, alt.slug)!]),
                    ),
                  },
                }
              : {}),
          };
        }),
    );
  };
}

/**
 * `app/robots.ts`: allows everything except the admin, and points to the sitemap. When the owner
 * refuses AI training (Réglages > Site et référencement), the training crawlers are refused; AI
 * search crawlers stay allowed.
 */
export function createRobots(config: OpenFlowConfig) {
  return async function robots(): Promise<MetadataRoute.Robots> {
    const snapshot = await getSnapshot(config);
    const everyone = { userAgent: "*", allow: "/", disallow: "/admin/" };
    return {
      rules:
        snapshot.site.aiTraining === "block"
          ? [everyone, { userAgent: AI_TRAINING_BOTS, disallow: "/" }]
          : everyone,
      sitemap: snapshot.site.url
        ? new URL("/sitemap.xml", snapshot.site.url).toString()
        : undefined,
    };
  };
}

const TEXT = { "Content-Type": "text/plain; charset=utf-8" };

/**
 * `app/llms.txt/route.ts`: the site for AI agents (https://llmstxt.org), the list of its pages.
 * ```ts
 * export const dynamic = "force-static";
 * export const GET = createLlmsTxt(config);
 * ```
 */
export function createLlmsTxt(config: OpenFlowConfig) {
  return async function GET(): Promise<Response> {
    return new Response(buildLlmsTxt(await getSnapshot(config), config), { headers: TEXT });
  };
}

/** `app/llms-full.txt/route.ts`: the text of every page, in Markdown. */
export function createLlmsFullTxt(config: OpenFlowConfig) {
  return async function GET(): Promise<Response> {
    return new Response(buildLlmsFullTxt(await getSnapshot(config), config), { headers: TEXT });
  };
}

/**
 * `app/rss.xml/route.ts`: the RSS feed of the collections (articles, events…), newest first. Pages
 * announce it (`<link rel="alternate">`) as soon as the config declares a collection.
 * ```ts
 * export const dynamic = "force-static";
 * export const GET = createRssFeed(config);
 * ```
 */
export function createRssFeed(config: OpenFlowConfig) {
  return async function GET(): Promise<Response> {
    return new Response(buildRssFeed(await getSnapshot(config), config), {
      headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    });
  };
}

/**
 * `app/indexnow.txt/route.ts`: the site's IndexNow key, made at the first publication. At each
 * publication, the changed pages are sent to IndexNow (Bing, Copilot, Yandex, Seznam…).
 * ```ts
 * export const dynamic = "force-static";
 * export const GET = createIndexNowKey(config);
 * ```
 */
export function createIndexNowKey(config: OpenFlowConfig) {
  return async function GET(): Promise<Response> {
    const key = (await getSnapshot(config)).integrations?.indexNowKey ?? "";
    return new Response(key, { headers: TEXT });
  };
}
