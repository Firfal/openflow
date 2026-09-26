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
