import type { OpenFlowConfig } from "@openflow/core";
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
