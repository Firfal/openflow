/**
 * Audience measurement without cookies (« Statistiques » in the admin). The published site sends one
 * small beacon per page view (`<OpenFlowStats>`, `POST /cms/view` → `cmsPageView`); the function
 * adds it to daily counters. Nothing identifies a visitor: no cookie, no identifier, no IP address
 * stored, only totals per day (pages, sources of the visits, kind of device). This is the audience
 * measurement the CNIL exempts from consent: no banner, and visitors can still refuse (« Ne pas
 * suivre », Global Privacy Control, or the opt-out of the site).
 *
 * The sources name the AI assistants (ChatGPT, Perplexity, Claude, Gemini, Copilot…): the visits
 * they send are the part of the site's « visibility in AI » a small business can measure itself.
 */

/** Hosting path of the beacon (rewrite to the `cmsPageView` function). */
export const STATS_PATH = "/cms/view";
/** `localStorage` key: « 1 » stops the counting on this browser (the owner's own visits). */
export const STATS_OPT_OUT_KEY = "cms-stats-optout";
/** Days are counted in the time of the site's visitors. */
export const STATS_TIME_ZONE = "Europe/Paris";
/**
 * Counters of a day are split over a few documents, so a busy day never hits the rate of writes
 * of one Firestore document.
 */
export const STATS_SHARDS = 4;
/** Counters are deleted after 25 months (CNIL), by a Firestore TTL policy on `expiresAt`. */
export const STATS_RETENTION_MONTHS = 25;
/** Referring sites kept per day, beyond which they count as « Autres sites ». */
export const STATS_MAX_SITES = 100;
/** Key of the pages that are not (or no longer) on the site. */
export const STATS_OTHER_PAGE = "(autre)";

export type StatsGroup = "ai" | "search" | "social" | "site" | "direct";
export type StatsDevice = "mobile" | "tablet" | "desktop";

export const STATS_GROUPS: Record<StatsGroup, string> = {
  ai: "Assistants IA",
  search: "Moteurs de recherche",
  social: "Réseaux sociaux",
  site: "Autres sites",
  direct: "Accès direct",
};

export const STATS_DEVICES: Record<StatsDevice, string> = {
  mobile: "Mobile",
  tablet: "Tablette",
  desktop: "Ordinateur",
};

interface SourceDef {
  label: string;
  group: StatsGroup;
  /** Referring hosts (subdomains included). */
  hosts: string[];
  /** Values of `utm_source` naming the source. */
  names?: string[];
}

/**
 * Known sources, by stable key (stored in the counters). Order matters: the first match wins
 * (Gemini before Google, Copilot before Bing).
 */
export const STATS_SOURCES: Record<string, SourceDef> = {
  chatgpt: {
    label: "ChatGPT",
    group: "ai",
    hosts: ["chatgpt.com", "chat.openai.com"],
    names: ["chatgpt", "openai"],
  },
  perplexity: { label: "Perplexity", group: "ai", hosts: ["perplexity.ai"] },
  claude: { label: "Claude", group: "ai", hosts: ["claude.ai"] },
  gemini: { label: "Gemini", group: "ai", hosts: ["gemini.google.com", "bard.google.com"] },
  copilot: {
    label: "Copilot",
    group: "ai",
    hosts: ["copilot.microsoft.com", "copilot.cloud.microsoft"],
  },
  mistral: {
    label: "Le Chat (Mistral)",
    group: "ai",
    hosts: ["chat.mistral.ai"],
    names: ["lechat"],
  },
  deepseek: { label: "DeepSeek", group: "ai", hosts: ["chat.deepseek.com"] },
  metaai: { label: "Meta AI", group: "ai", hosts: ["meta.ai"] },
  google: { label: "Google", group: "search", hosts: ["googlequicksearchbox"] },
  bing: { label: "Bing", group: "search", hosts: ["bing.com"] },
  duckduckgo: { label: "DuckDuckGo", group: "search", hosts: ["duckduckgo.com"] },
  qwant: { label: "Qwant", group: "search", hosts: ["qwant.com"] },
  ecosia: { label: "Ecosia", group: "search", hosts: ["ecosia.org"] },
  yahoo: { label: "Yahoo", group: "search", hosts: ["search.yahoo.com"] },
  brave: { label: "Brave Search", group: "search", hosts: ["search.brave.com"] },
  startpage: { label: "Startpage", group: "search", hosts: ["startpage.com"] },
  facebook: {
    label: "Facebook",
    group: "social",
    hosts: ["facebook.com", "fb.com", "fb.me"],
    names: ["fb"],
  },
  instagram: { label: "Instagram", group: "social", hosts: ["instagram.com"], names: ["ig"] },
  linkedin: { label: "LinkedIn", group: "social", hosts: ["linkedin.com", "lnkd.in"] },
  x: { label: "X (Twitter)", group: "social", hosts: ["t.co", "x.com", "twitter.com"] },
  pinterest: { label: "Pinterest", group: "social", hosts: ["pinterest.com", "pin.it"] },
  youtube: { label: "YouTube", group: "social", hosts: ["youtube.com", "youtu.be"] },
  tiktok: { label: "TikTok", group: "social", hosts: ["tiktok.com"] },
  reddit: { label: "Reddit", group: "social", hosts: ["reddit.com"] },
  threads: { label: "Threads", group: "social", hosts: ["threads.net", "threads.com"] },
  bluesky: { label: "Bluesky", group: "social", hosts: ["bsky.app"] },
  whatsapp: { label: "WhatsApp", group: "social", hosts: ["whatsapp.com", "wa.me"] },
  direct: { label: "Accès direct", group: "direct", hosts: [] },
  site: { label: "Autres sites", group: "site", hosts: [] },
};

const matchesHost = (host: string, suffix: string) =>
  host === suffix || host.endsWith(`.${suffix}`);

/** Google search in any country (`google.fr`, `www.google.co.uk`), not its other services. */
const GOOGLE_SEARCH = /^google\.[a-z]{2,3}(\.[a-z]{2})?$/;

/** A host as stored: lower case, without `www.`, at most 64 characters of a domain name. */
export function cleanHost(value: string): string | undefined {
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host) &&
    host.length <= 64
    ? host
    : undefined;
}

function sourceOfHost(host: string): string | undefined {
  for (const [key, def] of Object.entries(STATS_SOURCES)) {
    if (def.hosts.some((suffix) => matchesHost(host, suffix))) return key;
  }
  return GOOGLE_SEARCH.test(host) ? "google" : undefined;
}

/**
 * Where a visit comes from: `utm_source` first (ChatGPT adds `utm_source=chatgpt.com` to its
 * links), then the referring page. Returns the source key and, for any other site, its host.
 */
export function classifySource(input: {
  referrer?: string;
  utmSource?: string;
  /** The site's own host: a referrer from it is not a source. */
  siteHost?: string;
}): { source: string; host?: string } {
  const utm = input.utmSource?.trim().toLowerCase();
  if (utm) {
    const byName = Object.entries(STATS_SOURCES).find(([key, def]) =>
      [key, ...(def.names ?? [])].includes(utm),
    )?.[0];
    if (byName && byName !== "direct" && byName !== "site") return { source: byName };
    const host = cleanHost(utm);
    if (host) {
      const known = sourceOfHost(host);
      // A campaign of the owner (`utm_source=newsletter`) is shown like a referring site.
      return known ? { source: known } : { source: "site", host };
    }
  }
  let referrer: URL | undefined;
  try {
    referrer = input.referrer ? new URL(input.referrer) : undefined;
  } catch {
    referrer = undefined;
  }
  // Android apps send `android-app://com.google.android.gm/`: the app is the source.
  const host = referrer ? cleanHost(referrer.hostname) : undefined;
  if (!host || (input.siteHost && host === cleanHost(input.siteHost))) return { source: "direct" };
  const known = sourceOfHost(host);
  if (known) return { source: known };
  return { source: "site", host };
}

/** The kind of device, from the width of the window (CSS pixels). */
export function deviceOf(width: number): StatsDevice {
  if (!(width > 0) || width < 768) return "mobile";
  return width < 1100 ? "tablet" : "desktop";
}

/** Robots, previews and automated browsers are not visitors. */
const BOT_AGENTS =
  /(?<!cu)bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|prerender|facebookexternalhit|embedly|whatsapp|telegram|curl|wget|python|node-fetch|axios|go-http|java\/|okhttp|scrapy|phantom|puppeteer|playwright|selenium|chrome-lighthouse|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-user|perplexity/i;

export function isBotAgent(userAgent: string | undefined): boolean {
  return !userAgent || userAgent.length < 20 || BOT_AGENTS.test(userAgent);
}

/** `YYYY-MM-DD` of an instant in the site's time. */
export function statsDay(date: Date, timeZone = STATS_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** The day `n` days before (or after, when negative) a `YYYY-MM-DD` day. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** When the counters of a day are deleted (25 months later). */
export function statsExpiry(day: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 + STATS_RETENTION_MONTHS, d));
}

/**
 * `cms_stats/{day}-{shard}`: counters of one day (one of its shards), and `cms_stats/{day}-sites`:
 * the referring sites of the day (`sites`, at most {@link STATS_MAX_SITES}). Written by the
 * functions only; the owner reads them in the admin.
 */
export interface StatsDoc {
  day: string;
  /** Page views. */
  views?: number;
  /** Visits: views that start a visit (coming from elsewhere, not a reload). */
  visits?: number;
  /** Views per page address (`/`, `/contact/`, {@link STATS_OTHER_PAGE}). */
  pages?: Record<string, number>;
  /** Visits per source key ({@link STATS_SOURCES}). */
  sources?: Record<string, number>;
  /** Visits per device. */
  devices?: Partial<Record<StatsDevice, number>>;
  /** Visits sent by an AI assistant, per landing page. */
  aiPages?: Record<string, number>;
  /** `-sites` document: visits per referring host. */
  sites?: Record<string, number>;
  /** Page loads per Core Web Vitals rating. */
  vitals?: Partial<Record<Vital, Partial<Record<VitalRating, number>>>>;
  expiresAt?: unknown;
}

/**
 * Core Web Vitals, the speed visitors feel (and a Google ranking signal): LCP (the page shows,
 * ms), INP (it answers a click or a key, ms), CLS (it does not jump, unitless). Thresholds of
 * Google: « good » up to the first value, « poor » beyond the second.
 */
export const VITALS = {
  lcp: {
    label: "Affichage",
    hint: "Temps pour afficher l'essentiel de la page",
    fast: "rapides",
    poorLabel: "Lent",
    good: 2500,
    poor: 4000,
  },
  inp: {
    label: "Réactivité",
    hint: "Temps de réponse à un clic ou une touche",
    fast: "réactifs",
    poorLabel: "Lent",
    good: 200,
    poor: 500,
  },
  cls: {
    label: "Stabilité",
    hint: "Déplacements de la page pendant la lecture",
    fast: "stables",
    poorLabel: "Instable",
    good: 0.1,
    poor: 0.25,
  },
} as const;
export type Vital = keyof typeof VITALS;
export type VitalRating = "good" | "ni" | "poor";

/** Google's rating of one measure. */
export function rateVital(vital: Vital, value: number): VitalRating {
  const { good, poor } = VITALS[vital];
  return value <= good ? "good" : value <= poor ? "ni" : "poor";
}

/** One beacon of the site, as sent by `<OpenFlowStats>`. */
export interface PageViewBeacon {
  /** Path of the page (`location.pathname`). */
  p?: unknown;
  /** Referring page, first view of a visit only. */
  r?: unknown;
  /** `utm_source` of the address, first view of a visit only. */
  u?: unknown;
  /** Width of the window. */
  w?: unknown;
  /** The view starts a visit. */
  e?: unknown;
  /** Core Web Vitals of the page load (sent when the visitor leaves it), instead of a view. */
  v?: unknown;
}

export interface Ranked {
  key: string;
  label: string;
  count: number;
}

export interface StatsSummary {
  from: string;
  to: string;
  /** Every day of the period, empty days included. */
  days: Array<{ day: string; views: number; visits: number; ai: number }>;
  views: number;
  visits: number;
  /** Visits sent by AI assistants. */
  aiVisits: number;
  pages: Ranked[];
  /** Visits per source, most first. */
  sources: Array<Ranked & { group: StatsGroup }>;
  groups: Array<Ranked & { key: StatsGroup }>;
  /** Pages where the visits sent by AI assistants land. */
  aiPages: Ranked[];
  devices: Array<Ranked & { key: StatsDevice }>;
  /** Referring sites. */
  sites: Ranked[];
  /** Page loads measured per rating, and Google's verdict (75 % of the loads). */
  vitals: Array<{
    key: Vital;
    label: string;
    hint: string;
    good: number;
    ni: number;
    poor: number;
    total: number;
    rating: VitalRating;
  }>;
}

const addInto = (target: Map<string, number>, values: Record<string, number> | undefined) => {
  for (const [key, value] of Object.entries(values ?? {})) {
    if (typeof value === "number" && value > 0) target.set(key, (target.get(key) ?? 0) + value);
  }
};

const ranked = (values: Map<string, number>, label: (key: string) => string): Ranked[] =>
  [...values]
    .map(([key, count]) => ({ key, label: label(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

/**
 * Adds up the counters of a period (`from` to `to` included). `pageLabel` names a page address
 * (its title); the address itself by default.
 */
export function summarizeStats(
  docs: StatsDoc[],
  period: { from: string; to: string },
  pageLabel: (path: string) => string = (path) => path,
): StatsSummary {
  const byDay = new Map<string, { views: number; visits: number; ai: number }>();
  for (let day = period.from; day <= period.to; day = addDays(day, 1)) {
    byDay.set(day, { views: 0, visits: 0, ai: 0 });
  }
  const pages = new Map<string, number>();
  const sources = new Map<string, number>();
  const devices = new Map<string, number>();
  const aiPages = new Map<string, number>();
  const sites = new Map<string, number>();
  const vitals = new Map<Vital, Record<VitalRating, number>>();
  for (const doc of docs) {
    const day = byDay.get(doc.day);
    if (!day) continue;
    day.views += doc.views ?? 0;
    day.visits += doc.visits ?? 0;
    for (const [key, value] of Object.entries(doc.sources ?? {})) {
      if (STATS_SOURCES[key]?.group === "ai") day.ai += value;
    }
    addInto(pages, doc.pages);
    addInto(sources, doc.sources);
    addInto(devices, doc.devices);
    addInto(aiPages, doc.aiPages);
    addInto(sites, doc.sites);
    for (const [key, ratings] of Object.entries(doc.vitals ?? {}) as Array<
      [Vital, Partial<Record<VitalRating, number>>]
    >) {
      if (!(key in VITALS)) continue;
      const sum = vitals.get(key) ?? { good: 0, ni: 0, poor: 0 };
      for (const rating of ["good", "ni", "poor"] as const) sum[rating] += ratings?.[rating] ?? 0;
      vitals.set(key, sum);
    }
  }
  const days = [...byDay].map(([day, counts]) => ({ day, ...counts }));
  const sourceList = ranked(sources, (key) => STATS_SOURCES[key]?.label ?? key).map((entry) => ({
    ...entry,
    group: STATS_SOURCES[entry.key]?.group ?? "site",
  }));
  const groups = new Map<string, number>();
  for (const source of sourceList)
    groups.set(source.group, (groups.get(source.group) ?? 0) + source.count);
  const pageName = (path: string) =>
    path === STATS_OTHER_PAGE ? "Autres adresses" : pageLabel(path);
  return {
    from: period.from,
    to: period.to,
    days,
    views: days.reduce((sum, d) => sum + d.views, 0),
    visits: days.reduce((sum, d) => sum + d.visits, 0),
    aiVisits: days.reduce((sum, d) => sum + d.ai, 0),
    pages: ranked(pages, pageName),
    sources: sourceList,
    groups: ranked(
      groups,
      (key) => STATS_GROUPS[key as StatsGroup] ?? key,
    ) as StatsSummary["groups"],
    aiPages: ranked(aiPages, pageName),
    devices: ranked(
      devices,
      (key) => STATS_DEVICES[key as StatsDevice] ?? key,
    ) as StatsSummary["devices"],
    sites: ranked(sites, (key) => key),
    vitals: (Object.keys(VITALS) as Vital[]).flatMap((key) => {
      const counts = vitals.get(key);
      const total = counts ? counts.good + counts.ni + counts.poor : 0;
      if (!counts || total === 0) return [];
      // Google's assessment: the rating of the 75th percentile of the page loads.
      const rating: VitalRating =
        counts.good >= total * 0.75
          ? "good"
          : counts.good + counts.ni >= total * 0.75
            ? "ni"
            : "poor";
      return [{ key, label: VITALS[key].label, hint: VITALS[key].hint, ...counts, total, rating }];
    }),
  };
}

/** The period of the last `days` days, today included. */
export function statsPeriod(days: number, today: string): { from: string; to: string } {
  return { from: addDays(today, -(days - 1)), to: today };
}
