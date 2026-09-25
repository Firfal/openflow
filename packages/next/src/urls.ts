import { type Snapshot, slugToPath } from "@openflow/core";

/** Absolute URL of a page when `site.url` is known. */
export function pageUrl(site: Snapshot["site"], slug: string): string | undefined {
  if (!site.url) return undefined;
  return new URL(slugToPath(slug), site.url.endsWith("/") ? site.url : `${site.url}/`).toString();
}
