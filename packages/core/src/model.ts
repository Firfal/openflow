import type { Data } from "@puckeditor/core";
import type { BusinessInfo } from "./business.js";
import type { ImageVariant, VideoVariant } from "./fields.js";
import type { LegalInfo } from "./legal.js";

/**
 * Firestore collections of the CMS. All are prefixed with `cms_` to avoid clashes with the site's
 * own data. Internal names stay neutral (no product name): they live on in every delivered site.
 */
export const COLLECTIONS = {
  site: "cms_site",
  /** Page metadata only (title, address, status, SEO): light, listed live by the admin. */
  pages: "cms_pages",
  /** Content of each page (Puck data, same id as `cms_pages`), read when the page is opened. */
  pageContent: "cms_page_content",
  releases: "cms_releases",
  media: "cms_media",
  system: "cms_system",
  /**
   * AI assistants allowed on the site (MCP): owner-created keys and OAuth connections, hashed.
   * The owner lists and revokes them; only the functions write them.
   */
  agentTokens: "cms_agent_tokens",
  /** OAuth clients registered by AI assistants (dynamic client registration). Server only. */
  agentClients: "cms_agent_clients",
  /** Pending OAuth authorization requests, waiting for the owner's consent (10 min). Server only. */
  agentRequests: "cms_agent_requests",
  /** OAuth authorization codes, hashed, single use (5 min). Server only. */
  agentCodes: "cms_agent_codes",
  /** Messages sent with the site's forms (`cmsSubmitForm`), read in the admin. */
  messages: "cms_messages",
  /** Submissions per visitor (hashed address), against floods. Server only. */
  rateLimits: "cms_rate_limits",
  /** Audience counters per day, without cookies (`cmsPageView`), read in « Statistiques ». */
  stats: "cms_stats",
} as const;

/** Well-known document ids. */
export const DOCS = {
  settings: "settings",
  source: "source",
  /** `cms_system/schema`: serializable site schema (sections, fields, theme) for the MCP server. */
  schema: "schema",
  /** `cms_system/integrations`: public keys prepared by `openflow setup` (reCAPTCHA). */
  integrations: "integrations",
} as const;

/** Cloud Storage prefixes of the CMS (neutral, like the collections). */
export const STORAGE_PATHS = {
  media: "cms/media",
  source: "cms/source",
  snapshots: "cms/snapshots",
} as const;

/** Custom claim identifying the site owner (set by the `cmsClaimOwner` function). */
export const OWNER_CLAIM = "cms_owner";

/** Names of the callable Cloud Functions exposed by `@openflow/functions`. */
export const FUNCTION_NAMES = {
  claimOwner: "cmsClaimOwner",
  publish: "cmsPublish",
  restoreRelease: "cmsRestoreRelease",
  createAgentToken: "cmsCreateAgentToken",
  /** The owner's answer on the consent screen of an AI assistant (OAuth). */
  agentConsent: "cmsAgentConsent",
  /** Receives the forms of the published site (`/forms/submit`, Hosting rewrite). */
  submitForm: "cmsSubmitForm",
  /** Counts the page views of the published site (`/cms/view`, Hosting rewrite). */
  pageView: "cmsPageView",
  mcp: "cmsMcp",
} as const;

/**
 * Message logged by the functions when a publication fails: the alert set up by `openflow setup`
 * (Cloud Monitoring) e-mails the owner when it appears.
 */
export const PUBLICATION_FAILED_LOG = "CMS publication failed";

/** Message logged for a new form message when no e-mail service sends it (alert of `setup`). */
export const FORM_SUBMISSION_LOG = "CMS form submission";

/** `updatedBy` of the changes made by an AI assistant (the editor reloads them live). */
export const AGENT_AUTHOR = "Assistant IA";

/**
 * `cms_agent_tokens/{id}`: an AI assistant allowed on the site, either an access key created by the
 * owner (`kind` absent or `key`) or an OAuth connection (`oauth`: Claude, ChatGPT… signed in with
 * « Se connecter »). Only SHA-256 hashes of the secrets are stored.
 */
export interface AgentTokenDoc {
  kind?: "key" | "oauth";
  /** Name shown to the owner: the key's name, or the assistant's (« Claude »). */
  label: string;
  /** Hash of the key, or of the current OAuth access token. */
  hash: string;
  /** First characters of the key, to recognise it in the list. */
  prefix: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string;
  /** OAuth: registered client, expiry of the access token, current refresh token. */
  clientId?: string;
  expiresAt?: string;
  refreshHash?: string;
  refreshExpiresAt?: string;
  /** OAuth: where the assistant is sent back after consent (host or app), shown to the owner. */
  redirect?: string;
}

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

/** `cms_pages/{pageId}` — the working copy (draft) of a page. */
/**
 * A page as a whole. It is stored in two documents with the same id, so that the page list stays
 * light whatever the size of the pages: `cms_pages/{id}` ({@link PageMetaDoc}) and
 * `cms_page_content/{id}` ({@link PageContentDoc}).
 */
export interface PageDoc {
  slug: string;
  title: string;
  status: PageStatus;
  seo: PageSeo;
  data: Data;
  updatedAt: string;
  updatedBy?: string;
  /**
   * Set on the items of a collection (`config.collections`): the page is an article, a project…
   * Its slug starts with the collection's path, and its content holds the collection's section.
   */
  collection?: string;
  /**
   * Items only: the values of the collection's section shown in lists (texts, image, date…),
   * copied at each save so the admin lists items without loading their content.
   */
  summary?: Record<string, unknown>;
}

/** `cms_pages/{id}`: the page without its content. `updatedAt` also moves when the content changes. */
export type PageMetaDoc = Omit<PageDoc, "data">;

/** `cms_page_content/{id}`: the draft content of a page (Puck data). */
export interface PageContentDoc {
  data: Data;
  updatedAt: string;
  updatedBy?: string;
}

/** Joins the two documents of a page (an absent content is an empty page). */
export function joinPage(meta: PageMetaDoc, content: PageContentDoc | undefined): PageDoc {
  return { ...meta, data: content?.data ?? { root: { props: {} }, content: [] } };
}

/** Site-level settings edited in "Site et SEO". */
export interface SiteSettings {
  name: string;
  lang: string;
  url?: string;
  description?: string;
  ogImage?: string;
  /** Google Analytics 4 (`G-XXXXXXX`): loaded only after the visitor's consent. */
  gaMeasurementId?: string;
  /** The business behind the site (Réglages > Établissement): contact, address, hours. */
  business?: BusinessInfo;
  /**
   * AI crawlers that train models (GPTBot, ClaudeBot, Google-Extended…): `block` refuses them in
   * robots.txt. AI search crawlers stay allowed either way, so the site keeps being cited.
   */
  aiTraining?: "allow" | "block";
  /** `off` stops the audience measurement without cookies (Statistiques). On by default. */
  stats?: "on" | "off";
  /** The publisher (Réglages > Informations légales), for the legal notice and privacy policy. */
  legal?: LegalInfo;
}

/** `cms_system/integrations`: public keys prepared by `openflow setup`, copied into snapshots. */
export interface IntegrationsDoc {
  /** reCAPTCHA Enterprise site key (score, invisible) protecting the forms. */
  recaptchaSiteKey?: string;
  /**
   * IndexNow key (public by design: served at `/indexnow.txt`), made at the first publication.
   * Bing, Copilot, Yandex, Seznam… are told about the changed pages at each publication.
   */
  indexNowKey?: string;
  /** `resend` once `openflow mail` is set up: the forms' messages are e-mailed to the owner. */
  mail?: "resend";
  /** Google Cloud region of the site's data (Firestore, Storage, functions), set by setup. */
  region?: string;
}

/** `cms_site/settings`. */
export interface SettingsDoc {
  site: SiteSettings;
  values: Record<string, unknown>;
  /** Theme tokens chosen by the owner, e.g. `{ "color-ink": "#101820" }` (see `config.theme`). */
  theme?: Record<string, string>;
  updatedAt: string;
  updatedBy?: string;
}

export type ReleaseStatus = "queued" | "building" | "live" | "failed" | "superseded";

/** `cms_releases/{releaseId}` — written by Cloud Functions only. */
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
  /**
   * Daily refresh (`cmsDailyRefresh`): the online content rebuilt on a later day (an event or a
   * closure is over). When that content was published; the owner's drafts are compared to it.
   */
  contentAt?: string;
}

/** `createdBy` of the daily refreshes (the site rebuilt, its content unchanged). */
export const REFRESH_AUTHOR = "Mise à jour automatique";

/** When the content of a release was published (a refresh keeps the date of its content). */
export function publishedAt(release: Pick<ReleaseDoc, "createdAt" | "contentAt">): string {
  return release.contentAt ?? release.createdAt;
}

/** `cms_system/source` — last uploaded site source archive (written by `openflow deploy`). */
export interface SourceDoc {
  path: string;
  sha256: string;
  uploadedAt: string;
  uploadedBy?: string;
}

/** `cms_media/{mediaId}` — uploaded file metadata. */
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
  /**
   * Optimized copies made by `cmsOptimizeMedia`: WebP widths of an image, 1080p and 720p MP4
   * of a video. Used by the published site (`srcset`, `<source>`); the original stays untouched.
   */
  variants?: Array<ImageVariant | VideoVariant>;
  /** Poster extracted from a video (WebP). */
  poster?: string;
  /** State of the optimization, shown in the media library. */
  optimization?: { status: "pending" | "done" | "skipped" | "failed"; at?: string; error?: string };
}

/** Public URL of a Cloud Storage object readable without token (see `storage.rules`). */
export function publicStorageUrl(bucket: string, path: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}
