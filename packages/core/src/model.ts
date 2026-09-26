import type { Data } from "@puckeditor/core";

/** Firestore collections used by OpenFlow. All are prefixed with `of_` to avoid clashes. */
export const COLLECTIONS = {
  site: "of_site",
  pages: "of_pages",
  releases: "of_releases",
  media: "of_media",
  system: "of_system",
} as const;

/** Well-known document ids. */
export const DOCS = {
  settings: "settings",
  source: "source",
} as const;

/** Cloud Storage prefixes used by OpenFlow. */
export const STORAGE_PATHS = {
  media: "openflow/media",
  source: "openflow/source",
  snapshots: "openflow/snapshots",
} as const;

/** Custom claim identifying the site owner (set by the `openflowClaimOwner` function). */
export const OWNER_CLAIM = "of_owner";

/** Names of the callable Cloud Functions exposed by `@openflow/functions`. */
export const FUNCTION_NAMES = {
  claimOwner: "openflowClaimOwner",
  publish: "openflowPublish",
  restoreRelease: "openflowRestoreRelease",
} as const;

/** Default Firebase project id used with the local emulators. */
export const DEMO_PROJECT_ID = "demo-openflow";

/** Maximum Firestore document size is 1 MiB; warn well before it. */
export const PAGE_SIZE_WARNING_BYTES = 800 * 1024;

export type PageStatus = "draft" | "published";

export interface PageSeo {
  title?: string;
  description?: string;
  ogImage?: string;
  noindex?: boolean;
}

/** `of_pages/{pageId}` — the working copy (draft) of a page. */
export interface PageDoc {
  slug: string;
  title: string;
  status: PageStatus;
  seo: PageSeo;
  data: Data;
  updatedAt: string;
  updatedBy?: string;
}

/** Site-level settings edited in "Site et SEO". */
export interface SiteSettings {
  name: string;
  lang: string;
  url?: string;
  description?: string;
  ogImage?: string;
}

/** `of_site/settings`. */
export interface SettingsDoc {
  site: SiteSettings;
  values: Record<string, unknown>;
  updatedAt: string;
  updatedBy?: string;
}

export type ReleaseStatus = "queued" | "building" | "live" | "failed" | "superseded";

/** `of_releases/{releaseId}` — written by Cloud Functions only. */
export interface ReleaseDoc {
  status: ReleaseStatus;
  createdAt: string;
  createdBy: string;
  snapshotPath: string;
  sourcePath?: string;
  builder: "cloud-build" | "local";
  buildId?: string;
  logUrl?: string;
  hostingVersion?: string;
  finishedAt?: string;
  error?: string;
  pageCount: number;
  /** Set when this release was re-activated through "Restaurer". */
  restoredAt?: string;
}

/** `of_system/source` — last uploaded site source archive (written by `openflow deploy`). */
export interface SourceDoc {
  path: string;
  sha256: string;
  uploadedAt: string;
  uploadedBy?: string;
}

/** `of_media/{mediaId}` — uploaded file metadata. */
export interface MediaDoc {
  path: string;
  url: string;
  name: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
  alt?: string;
  /** `static`: file shipped with the site in `public/` (listed by `openflow seed`). */
  source?: "storage" | "static";
  createdAt: string;
}

/** Public URL of a Cloud Storage object readable without token (see `storage.rules`). */
export function publicStorageUrl(bucket: string, path: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}
