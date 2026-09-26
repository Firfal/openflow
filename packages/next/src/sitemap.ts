import { buildLlmsFullTxt, buildLlmsTxt, type OpenFlowConfig } from "@openflow/core";
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
    return snapshot.pages
      .filter((page) => !page.seo.noindex)
      .map((page) => pageUrl(snapshot.site, page.slug))
      .filter((url): url is string => Boolean(url))
      .map((url) => ({ url, lastModified: snapshot.createdAt }));
  };
}

/** `app/robots.ts`: allows everything except the admin, and points to the sitemap. */
export function createRobots(config: OpenFlowConfig) {
  return async function robots(): Promise<MetadataRoute.Robots> {
    const snapshot = await getSnapshot(config);
    return {
      rules: { userAgent: "*", allow: "/", disallow: "/admin/" },
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
    return new Response(buildLlmsTxt(await getSnapshot(config)), { headers: TEXT });
  };
}

/** `app/llms-full.txt/route.ts`: the text of every page, in Markdown. */
export function createLlmsFullTxt(config: OpenFlowConfig) {
  return async function GET(): Promise<Response> {
    return new Response(buildLlmsFullTxt(await getSnapshot(config), config), { headers: TEXT });
  };
}
