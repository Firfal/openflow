/**
 * Lightweight entry for route handlers (`app/sitemap.ts`, `app/robots.ts`): no Puck and no
 * `next/navigation`, which Next.js does not allow outside of pages.
 */
export { createRobots, createSitemap } from "./sitemap.js";
export { getPages, getSettings, getSite, getSnapshot, snapshotSource } from "./snapshot.js";
export { pageUrl } from "./urls.js";
