import type { ComponentData, Data, Field } from "@puckeditor/core";
import type { CollectionConfig, OpenFlowConfig } from "./config.js";
import { getOpenFlowFieldKind, type ImageValue, isValidDate, today } from "./fields.js";
import type { PageStatus } from "./model.js";
import { isValidSlug, slugify, slugToPath } from "./slug.js";
import type { Issue } from "./validate.js";

/**
 * Collections (articles, projects, events…). An item is a page like the others, with two more
 * properties: `collection` (its collection's name) and `summary` (the values shown in lists). Its
 * content holds the collection's section (`component`), which carries the item's fields; the
 * owner may add other sections around it. Everything built for pages (editor, autosave, SEO,
 * links, publication, history, AI tools) therefore works for items too.
 */

/** An item as sections list it (`getCollection(puck.metadata, name)`). */
export interface CollectionEntry<Values extends Record<string, any> = Record<string, any>> {
  id: string;
  collection: string;
  /** Full slug, e.g. `actualites/ouverture-du-samedi`. */
  slug: string;
  /** Address of the item's page, e.g. `/actualites/ouverture-du-samedi/`. */
  href: string;
  title: string;
  /** Publication date (`YYYY-MM-DD`), with a `dateField` in the collection; for events, the first day. */
  date?: string;
  /** Events: last day (`endDateField`), time (`timeField`) and place (`locationField`). */
  endDate?: string;
  time?: string;
  location?: string;
  /** Events, services, products: the price as written (`priceField`). */
  price?: string;
  /** The description field, or the beginning of the item's text. */
  description?: string;
  /** The collection's image field. */
  image?: ImageValue | null;
  /** Estimated reading time, in minutes (at least 1). */
  readingTime: number;
  /** Values of the collection's section, without its rich texts and slots. */
  fields: Values;
}

/** Reserved keys of a summary (field names starting with `_` are OpenFlow's). */
const EXCERPT_KEY = "_excerpt";
const WORDS_KEY = "_words";
const EXCERPT_LENGTH = 220;
const WORDS_PER_MINUTE = 200;

export const COLLECTION_NAME = /^[a-z][a-z0-9-]*$/;

/** The collection named `name`, if the config declares it. */
export function getCollectionConfig(
  config: Pick<OpenFlowConfig, "collections">,
  name: string | undefined,
): CollectionConfig | undefined {
  return name ? config.collections?.[name] : undefined;
}

/** Names of the sections that show an item: kept out of the section library and of pages. */
export function itemComponents(config: Pick<OpenFlowConfig, "collections">): Set<string> {
  return new Set(Object.values(config.collections ?? {}).map((c) => c.component));
}

export const titleFieldOf = (collection: CollectionConfig) => collection.titleField ?? "title";

/** The section of `data` that shows the item (the first one of the collection's type). */
export function findItemComponent(
  data: Data | undefined,
  collection: CollectionConfig,
): ComponentData | undefined {
  return data?.content?.find((item) => item.type === collection.component);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
};

/** Plain text of a rich text (HTML) value. */
export function richTextToPlain(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name: string) => ENTITIES[name] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /\p{L}|\p{N}/u.test(word)).length;
}

/** Words of every text of a value (texts, rich texts, lists and groups). */
function wordsOf(field: Field, value: unknown): number {
  if (typeof value === "string") {
    if (field.type === "richtext") return countWords(richTextToPlain(value));
    if (field.type === "text" || field.type === "textarea") return countWords(value);
    return 0;
  }
  if (field.type === "array" && Array.isArray(value)) {
    let total = 0;
    for (const item of value) {
      for (const [key, sub] of Object.entries((field.arrayFields ?? {}) as Record<string, Field>))
        total += wordsOf(sub, (item as Record<string, unknown>)?.[key]);
    }
    return total;
  }
  if (field.type === "object" && value && typeof value === "object") {
    let total = 0;
    for (const [key, sub] of Object.entries((field.objectFields ?? {}) as Record<string, Field>))
      total += wordsOf(sub, (value as Record<string, unknown>)[key]);
    return total;
  }
  return 0;
}

/**
 * The values of an item shown in lists: every field of the collection's section except rich texts
 * and slots (they can be long), plus the beginning of the first rich text (`_excerpt`) and the
 * number of words (`_words`, for the reading time).
 */
export function itemSummary(
  props: Record<string, unknown>,
  collection: CollectionConfig,
  config: Pick<OpenFlowConfig, "components">,
): Record<string, unknown> {
  const component = config.components[collection.component];
  const fields = (component?.fields ?? {}) as Record<string, Field>;
  const values = { ...(component?.defaultProps ?? {}), ...props } as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  let excerpt = "";
  let words = 0;
  for (const [key, field] of Object.entries(fields)) {
    const value = values[key];
    words += wordsOf(field, value);
    if (field.type === "slot") continue;
    if (field.type === "richtext") {
      if (!excerpt && typeof value === "string") excerpt = richTextToPlain(value);
      continue;
    }
    if (value !== undefined) summary[key] = value;
  }
  if (excerpt) summary[EXCERPT_KEY] = truncate(excerpt, EXCERPT_LENGTH);
  summary[WORDS_KEY] = words;
  // Firestore refuses `undefined`: a JSON round trip drops it (and any stray editor marker).
  return JSON.parse(JSON.stringify(summary)) as Record<string, unknown>;
}

/**
 * What an item's page stores besides its content: its title (the collection's title field, so
 * the list and the page's `<title>` follow what the owner typed on the page) and its summary.
 */
export function itemMeta(
  data: Data,
  collection: CollectionConfig,
  config: Pick<OpenFlowConfig, "components">,
): { title?: string; summary: Record<string, unknown> } {
  const props = (findItemComponent(data, collection)?.props ?? {}) as Record<string, unknown>;
  const summary = itemSummary(props, collection, config);
  const raw = summary[titleFieldOf(collection)];
  const title = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  return { title: title || undefined, summary };
}

/** A page of the site, enough to list it as an item. */
export interface ItemSource {
  id: string;
  slug: string;
  title: string;
  status?: PageStatus;
  collection?: string;
  /** The stored summary (admin) … */
  summary?: Record<string, unknown>;
  /** … or the content, from which it is computed (published site). */
  data?: Data;
}

/** An item of the site as sections list it. */
export function collectionEntry(
  page: ItemSource,
  collection: CollectionConfig,
  config: Pick<OpenFlowConfig, "components">,
): CollectionEntry {
  const summary =
    page.data !== undefined
      ? itemSummary(
          (findItemComponent(page.data, collection)?.props ?? {}) as Record<string, unknown>,
          collection,
          config,
        )
      : (page.summary ?? {});
  const {
    [EXCERPT_KEY]: excerpt,
    [WORDS_KEY]: words,
    ...fields
  } = summary as Record<string, unknown>;
  const date = collection.dateField ? fields[collection.dateField] : undefined;
  const written = collection.descriptionField ? fields[collection.descriptionField] : undefined;
  const description =
    (typeof written === "string" && written.trim()) ||
    (typeof excerpt === "string" && excerpt) ||
    undefined;
  const image = collection.imageField ? fields[collection.imageField] : undefined;
  const text = (key: string | undefined) => {
    const value = key ? fields[key] : undefined;
    return typeof value === "number"
      ? String(value)
      : typeof value === "string" && value.trim()
        ? value.trim()
        : undefined;
  };
  const endDate = collection.endDateField ? fields[collection.endDateField] : undefined;
  const time = text(collection.timeField);
  const location = text(collection.locationField);
  const price = text(collection.priceField);
  return {
    id: page.id,
    collection: page.collection ?? "",
    slug: page.slug,
    href: slugToPath(page.slug),
    title: page.title,
    ...(isValidDate(date) ? { date } : {}),
    ...(isValidDate(endDate) && endDate !== date ? { endDate } : {}),
    ...(time ? { time } : {}),
    ...(location ? { location } : {}),
    ...(price ? { price } : {}),
    ...(description ? { description } : {}),
    ...(image !== undefined ? { image: image as ImageValue | null } : {}),
    readingTime: Math.max(1, Math.round((Number(words) || 0) / WORDS_PER_MINUTE)),
    fields,
  };
}

/** Default order of a collection's items. */
export function collectionSort(collection: CollectionConfig): "date" | "title" | "upcoming" {
  return (
    collection.sort ??
    (collection.dateField ? (collection.kind === "event" ? "upcoming" : "date") : "title")
  );
}

/**
 * Items in the collection's order: newest first (`date`), alphabetical (`title`), or coming
 * events first then past ones (`upcoming`, as of `today`).
 */
export function sortEntries(
  entries: CollectionEntry[],
  collection: CollectionConfig,
  todayDate = today(),
) {
  const byTitle = (a: CollectionEntry, b: CollectionEntry) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
  const sort = collectionSort(collection);
  if (sort === "upcoming") {
    const last = (entry: CollectionEntry) => entry.endDate ?? entry.date ?? "";
    const coming = entries.filter((entry) => entry.date && last(entry) >= todayDate);
    const past = entries.filter((entry) => !coming.includes(entry));
    const soonest = (a: CollectionEntry, b: CollectionEntry) =>
      (a.date ?? "").localeCompare(b.date ?? "") ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      byTitle(a, b);
    const latest = (a: CollectionEntry, b: CollectionEntry) =>
      !a.date ? 1 : !b.date ? -1 : b.date.localeCompare(a.date) || byTitle(a, b);
    return [...coming.sort(soonest), ...past.sort(latest)];
  }
  return [...entries].sort((a, b) => {
    if (sort === "date" && a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? 1 : -1;
    }
    return byTitle(a, b) || a.id.localeCompare(b.id);
  });
}

/**
 * Every collection of the config with its visible items, sorted. Passed to the sections as
 * `puck.metadata.collections`, on the published site and in the editor.
 */
export function buildCollections(
  pages: ItemSource[],
  config: Pick<OpenFlowConfig, "components" | "collections">,
): Record<string, CollectionEntry[]> {
  const out: Record<string, CollectionEntry[]> = {};
  for (const [name, collection] of Object.entries(config.collections ?? {})) {
    const entries = pages
      .filter((page) => page.collection === name && page.status !== "draft")
      .map((page) => collectionEntry(page, collection, config));
    out[name] = sortEntries(entries, collection);
  }
  return out;
}

/** What the sections receive in `puck.metadata` (published site and editor). */
export interface OpenFlowMetadata {
  page?: { id: string; slug: string; title: string; collection?: string };
  collections?: Record<string, CollectionEntry[]>;
  /** Language of the page shown (`fr`, `en`…): dates and hours are written in it. */
  locale?: string;
  [key: string]: unknown;
}

/**
 * The language of the page a section is shown in, for dates and numbers:
 * `formatDate(date, pageLang(puck.metadata))`.
 */
export function pageLang(metadata: unknown, fallback = "fr"): string {
  const locale = (metadata as OpenFlowMetadata | undefined)?.locale;
  return typeof locale === "string" && locale ? locale : fallback;
}

/**
 * The items of a collection, in its order, for a section that lists them:
 *
 * ```tsx
 * render: ({ count, puck }) => {
 *   const items = getCollection<ArticleProps>(puck.metadata, "actualites").slice(0, count);
 * ```
 */
export function getCollection<Values extends Record<string, any> = Record<string, any>>(
  metadata: unknown,
  name: string,
): CollectionEntry<Values>[] {
  const collections = (metadata as OpenFlowMetadata | undefined)?.collections;
  return (collections?.[name] ?? []) as CollectionEntry<Values>[];
}

/** The items before and after the current one, in the collection's order (item pages only). */
export function adjacentEntries<Values extends Record<string, any> = Record<string, any>>(
  metadata: unknown,
): { previous?: CollectionEntry<Values>; next?: CollectionEntry<Values> } {
  const page = (metadata as OpenFlowMetadata | undefined)?.page;
  if (!page?.collection) return {};
  const list = getCollection<Values>(metadata, page.collection);
  const index = list.findIndex((entry) => entry.id === page.id);
  if (index === -1) return {};
  return { previous: list[index - 1], next: list[index + 1] };
}

/** Slug of a new item: `<path>/<title>`. */
export function itemSlug(collection: CollectionConfig, title: string): string {
  return `${collection.path}/${slugify(title) || "element"}`;
}

/** Content of a new item: the collection's section, with its title (and today's date). */
export function newItemData(
  collection: CollectionConfig,
  config: Pick<OpenFlowConfig, "components">,
  input: { title: string; date?: string; id?: string },
): Data {
  const defaults = structuredClone(
    config.components[collection.component]?.defaultProps ?? {},
  ) as Record<string, unknown>;
  const props: Record<string, unknown> = {
    ...defaults,
    id: input.id ?? `${collection.component}-1`,
    [titleFieldOf(collection)]: input.title,
  };
  if (collection.dateField) props[collection.dateField] = input.date ?? today();
  return { root: { props: {} }, content: [{ type: collection.component, props } as ComponentData] };
}

/** Sets the title field of an item's section (when the owner renames it outside the page). */
export function setItemTitle(data: Data, collection: CollectionConfig, title: string): Data {
  const copy = structuredClone(data);
  const item = findItemComponent(copy, collection);
  if (item) (item.props as Record<string, unknown>)[titleFieldOf(collection)] = title;
  return copy;
}

function fieldKind(field: Field | undefined): string | undefined {
  return field ? (getOpenFlowFieldKind(field) ?? field.type) : undefined;
}

/** Checks `collections` in the config (OF-203). */
export function validateCollections(config: OpenFlowConfig, file: string): Issue[] {
  const issues: Issue[] = [];
  const error = (message: string, hint?: string) =>
    issues.push({ rule: "OF-203", severity: "error", message, file, hint });
  const paths = new Map<string, string>();
  const components = new Map<string, string>();
  for (const [name, collection] of Object.entries(config.collections ?? {})) {
    const where = `Collection « ${name} »`;
    if (!COLLECTION_NAME.test(name)) {
      error(
        `${where} : nom invalide (minuscules, chiffres et tirets, ex. « actualites »).`,
        "Le nom est enregistré avec chaque élément : choisissez-le une fois pour toutes.",
      );
    }
    if (!collection.label?.trim())
      error(`${where} : \`label\` est obligatoire (ex. « Actualités »).`);
    if (!collection.path || !isValidSlug(collection.path)) {
      error(
        `${where} : \`path\` invalide « ${collection.path ?? ""} » (ex. « actualites » pour /actualites/mon-article/).`,
      );
    } else {
      const other = paths.get(collection.path);
      if (other) error(`${where} : même adresse que la collection « ${other} ».`);
      paths.set(collection.path, name);
    }
    const component = config.components?.[collection.component];
    if (!component) {
      error(
        `${where} : la section « ${collection.component} » n'existe pas dans \`components\`.`,
        "Déclarez la section qui affiche un élément (son titre, sa date, son texte…) dans `components`, puis nommez-la dans `component`.",
      );
      continue;
    }
    const owner = components.get(collection.component);
    if (owner) {
      error(
        `${where} : la section « ${collection.component} » sert déjà la collection « ${owner} ».`,
      );
    }
    components.set(collection.component, name);
    const fields = (component.fields ?? {}) as Record<string, Field>;
    const expect = (key: string | undefined, kinds: string[], role: string, label: string) => {
      if (key === undefined) return;
      const kind = fieldKind(fields[key]);
      if (!kind) {
        error(`${where} : ${role} « ${key} » n'est pas un champ de « ${collection.component} ».`);
      } else if (!kinds.includes(kind)) {
        error(`${where} : ${role} « ${key} » doit être ${label}.`);
      }
    };
    expect(titleFieldOf(collection), ["text", "textarea"], "le titre", "un champ texte");
    expect(collection.dateField, ["date"], "la date", "un champ `dateField()`");
    expect(collection.descriptionField, ["text", "textarea"], "la description", "un champ texte");
    expect(collection.imageField, ["image"], "l'image", "un champ `imageField()`");
    expect(collection.endDateField, ["date"], "la date de fin", "un champ `dateField()`");
    expect(collection.timeField, ["text"], "l'heure", "un champ texte");
    expect(collection.locationField, ["text", "textarea"], "le lieu", "un champ texte");
    expect(collection.priceField, ["text", "number"], "le prix", "un champ texte ou nombre");
    if (collection.kind === "event" && !collection.dateField) {
      error(
        `${where} : une collection d'événements a besoin d'un \`dateField\` (le jour de l'événement).`,
      );
    }
  }
  return issues;
}

/** Checks that a page and its collection agree (OF-201): address, and the item's section. */
export function validateItem(
  page: { slug: string; collection?: string; data: Data },
  config: OpenFlowConfig,
  file?: string,
  options: { address?: boolean } = {},
): Issue[] {
  const issues: Issue[] = [];
  const error = (message: string, hint?: string) =>
    issues.push({ rule: "OF-201", severity: "error", message, file, hint });
  const reserved = itemComponents(config);
  if (!page.collection) {
    for (const item of page.data.content ?? []) {
      if (reserved.has(item.type)) {
        error(
          `La section « ${item.type} » est réservée aux éléments d'une collection : elle ne peut pas figurer sur une page.`,
          'Ajoutez `"collection": "<nom>"` au fichier si c\'est un élément, ou retirez la section.',
        );
      }
    }
    return issues;
  }
  const collection = getCollectionConfig(config, page.collection);
  if (!collection) {
    error(
      `Collection inconnue « ${page.collection} » (collections : ${Object.keys(config.collections ?? {}).join(", ") || "aucune"}).`,
    );
    return issues;
  }
  if (options.address !== false && !page.slug.startsWith(`${collection.path}/`)) {
    error(
      `L'adresse « ${slugToPath(page.slug)} » doit commencer par /${collection.path}/ (collection « ${page.collection} »).`,
    );
  }
  const count = (page.data.content ?? []).filter((c) => c.type === collection.component).length;
  if (count !== 1) {
    error(
      `Un élément de « ${page.collection} » doit contenir une seule section « ${collection.component} » (trouvé : ${count}).`,
    );
  }
  for (const item of page.data.content ?? []) {
    if (reserved.has(item.type) && item.type !== collection.component) {
      error(`La section « ${item.type} » appartient à une autre collection.`);
    }
  }
  return issues;
}
