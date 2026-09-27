import type { ComponentData, Data, Field, Fields } from "@puckeditor/core";
import { z } from "zod";
import { BUSINESS_TYPES, type BusinessInfo, businessLines, WEEKDAYS } from "../business.js";
import { businessSchema, sanitizeBusiness } from "../business-schema.js";
import {
  buildCollections,
  getCollectionConfig,
  itemComponents,
  itemMeta,
  itemSlug,
  newItemData,
  setItemTitle,
  titleFieldOf,
  validateItem,
} from "../collections.js";
import type { OpenFlowConfig } from "../config.js";
import { getOpenFlowFieldKind, isSafeHref, isValidDate, today } from "../fields.js";
import { collectEditablePaths } from "../marks.js";
import type { MediaDoc, PageSeo, PageStatus, ReleaseStatus, SiteSettings } from "../model.js";
import { isValidSlug, normalizeSlug, slugify, slugToPath } from "../slug.js";
import {
  type ResponsiveStyle,
  type SectionStyle,
  STYLE_KEY,
  STYLE_PROPERTIES,
  type StyleProperty,
  sanitizeStyle,
  sanitizeTheme,
  styleValuesSchema,
} from "../style.js";
import { applyDefaults, validatePageData, validateSettingsValues } from "../validate.js";
import { sanitizeRichText } from "./html.js";
import type { FieldSchema, SiteSchema } from "./schema.js";

/**
 * Tools that let an AI assistant edit an OpenFlow site by chat. The same definitions are served by
 * the MCP server (Cloud Functions, `cmsMcp`) and registered with WebMCP by the admin, each
 * with its own {@link AgentBackend} (Firebase Admin SDK or the owner's browser session).
 *
 * Every change is a draft: nothing is online before `publish`.
 */

/** An error shown to the AI (in French, like the rest of the owner-facing product). */
export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentError";
  }
}

export interface AgentPage {
  id: string;
  slug: string;
  title: string;
  status: PageStatus;
  seo: PageSeo;
  data: Data;
  updatedAt?: string;
  /** Items of a collection (article, project…): the collection's name. */
  collection?: string;
}

/** What a save of an item's content also updates on its page: title and list values. */
export interface ItemMetaPatch {
  title?: string;
  summary: Record<string, unknown>;
}

export interface AgentMedia extends Pick<MediaDoc, "url" | "name" | "contentType"> {
  id: string;
  alt?: string;
  width?: number;
  height?: number;
  source?: "storage" | "static";
}

export interface AgentRelease {
  id: string;
  status: ReleaseStatus;
  createdAt: string;
  finishedAt?: string;
  error?: string;
  pageCount?: number;
}

export interface AgentSettings {
  site: SiteSettings;
  values: Record<string, unknown>;
  theme: Record<string, string>;
}

/** Storage of the site, implemented with the Admin SDK (server) or the web SDK (admin). */
export interface AgentBackend {
  listPages(): Promise<AgentPage[]>;
  getPage(id: string): Promise<AgentPage | undefined>;
  /** Saves a page's content; for an item, `meta` updates its title and summary in the same write. */
  savePageData(id: string, data: Data, meta?: ItemMetaPatch): Promise<void>;
  savePageMeta(
    id: string,
    meta: Partial<Pick<AgentPage, "title" | "slug" | "status" | "seo">>,
  ): Promise<void>;
  /** Creates a page (or an item) with this id (the caller made it unique) and returns it. */
  createPage(
    id: string,
    page: Omit<AgentPage, "id" | "updatedAt"> & { summary?: Record<string, unknown> },
  ): Promise<string>;
  deletePage(id: string): Promise<void>;
  getSettings(): Promise<AgentSettings>;
  saveSettingsValues(values: Record<string, unknown>): Promise<void>;
  saveTheme(theme: Record<string, string>): Promise<void>;
  /** Replaces the business profile (`site.business`); `null` removes it. */
  saveBusiness(business: BusinessInfo | null): Promise<void>;
  listMedia(): Promise<AgentMedia[]>;
  /** Copies a public image or video into the media library. */
  importMedia(url: string, alt?: string): Promise<AgentMedia>;
  publish(): Promise<{ releaseId: string }>;
  listReleases(max: number): Promise<AgentRelease[]>;
}

export interface AgentContext {
  config: OpenFlowConfig;
  schema: SiteSchema;
  backend: AgentBackend;
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

interface ToolDefinition<I extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: I;
  annotations: ToolAnnotations;
  run: (input: z.infer<I>, ctx: AgentContext) => Promise<unknown>;
}

// ---------------------------------------------------------------------------------------------
// Helpers

const pageRef = z
  .string()
  .min(1)
  .describe(
    "Identifiant de la page (voir get_site_overview) ou son adresse, ex. « / » ou « /a-propos/ ».",
  );
const sectionRef = z.string().min(1).describe("Identifiant de la section (voir get_page).");

async function findPage(ctx: AgentContext, ref: string): Promise<AgentPage> {
  const direct = await ctx.backend.getPage(ref);
  if (direct) return direct;
  const slug = normalizeSlug(ref);
  const pages = await ctx.backend.listPages();
  const page = pages.find((p) => p.slug === slug || p.id === ref);
  if (!page) {
    throw new AgentError(
      `Page « ${ref} » introuvable. Pages existantes : ${pages.map((p) => `${p.id} (${slugToPath(p.slug)})`).join(", ")}.`,
    );
  }
  return page;
}

interface Located {
  list: ComponentData[];
  index: number;
  item: ComponentData;
}

/** Finds a section in the page, including sections nested in slots. */
function locate(data: Data, id: string): Located | undefined {
  const search = (list: unknown): Located | undefined => {
    if (!Array.isArray(list)) return undefined;
    for (const [index, item] of list.entries()) {
      if (!item || typeof item !== "object" || !("props" in item)) continue;
      const component = item as ComponentData;
      if (component.props.id === id)
        return { list: list as ComponentData[], index, item: component };
      for (const value of Object.values(component.props)) {
        const found = search(value);
        if (found) return found;
      }
    }
    return undefined;
  };
  return (
    search(data.content) ??
    Object.values(data.zones ?? {})
      .map((zone) => search(zone))
      .find(Boolean)
  );
}

function requireSection(data: Data, id: string): Located {
  const found = locate(data, id);
  if (!found) {
    const ids = data.content.map((item) => `${item.props.id} (${item.type})`).join(", ");
    throw new AgentError(
      `Section « ${id} » introuvable dans la page. Sections : ${ids || "aucune"}.`,
    );
  }
  return found;
}

function sectionFields(ctx: AgentContext, type: string): Record<string, Field> {
  const component = ctx.config.components[type];
  if (!component) {
    throw new AgentError(
      `Type de section inconnu « ${type} ». Types disponibles : ${Object.keys(ctx.config.components).join(", ")}.`,
    );
  }
  return (component.fields ?? {}) as Record<string, Field>;
}

type Segment = string | number;

/** `items[1].answer` → `["items", 1, "answer"]`. */
function parsePath(path: string): Segment[] {
  const segments: Segment[] = [];
  for (const match of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    segments.push(match[2] !== undefined ? Number(match[2]) : (match[1] as string));
  }
  if (segments.length === 0 || segments.join("") === "") throw new AgentError(`Chemin vide.`);
  return segments;
}

/** The field a path points to (list indices included), or an error naming the valid keys. */
function fieldAt(fields: Record<string, Field>, segments: Segment[], path: string): Field {
  let current: Record<string, Field> = fields;
  let field: Field | undefined;
  for (let n = 0; n < segments.length; n++) {
    const segment = segments[n] as Segment;
    if (typeof segment === "number") {
      if (field?.type !== "array")
        throw new AgentError(`« ${path} » : [${segment}] ne s'applique qu'à une liste.`);
      if (n === segments.length - 1)
        return { type: "object", objectFields: field.arrayFields } as Field;
      continue;
    }
    field = current[segment];
    if (!field) {
      throw new AgentError(
        `« ${path} » : champ « ${segment} » inconnu. Champs possibles : ${Object.keys(current).join(", ")}.`,
      );
    }
    if (field.type === "array") current = field.arrayFields as Record<string, Field>;
    else if (field.type === "object") current = field.objectFields as Record<string, Field>;
    else if (n < segments.length - 1)
      throw new AgentError(`« ${path} » : « ${segment} » n'a pas de sous-champ.`);
  }
  return field as Field;
}

function setAt(target: unknown, segments: Segment[], value: unknown): unknown {
  const [head, ...rest] = segments;
  if (head === undefined) return value;
  if (typeof head === "number") {
    const list = Array.isArray(target) ? [...target] : [];
    if (head > list.length)
      throw new AgentError(`Indice ${head} hors de la liste (${list.length} éléments).`);
    list[head] = setAt(list[head] ?? {}, rest, value);
    return list;
  }
  const object =
    target && typeof target === "object" && !Array.isArray(target) ? { ...(target as object) } : {};
  (object as Record<string, unknown>)[head] = setAt(
    (object as Record<string, unknown>)[head],
    rest,
    value,
  );
  return object;
}

/**
 * Makes an AI-provided value fit its field: rich text is sanitized, internal links get their
 * address, a plain URL becomes an image, unsafe links and images are refused.
 */
function normalizeValue(
  field: Field,
  value: unknown,
  path: string,
  hrefs: Map<string, string>,
): unknown {
  if (value === undefined) return undefined;
  const kind = getOpenFlowFieldKind(field);
  if (kind === "image" || kind === "video") {
    if (value === null) return null;
    const media = typeof value === "string" ? { src: value } : (value as Record<string, unknown>);
    const src = typeof media?.src === "string" ? media.src.trim() : "";
    if (!/^(?:https?:\/\/|\/)/i.test(src)) {
      throw new AgentError(
        `« ${path} » : adresse de ${kind === "image" ? "l'image" : "la vidéo"} invalide (https://… ou /… attendu).`,
      );
    }
    return kind === "image" ? { alt: "", ...media, src } : { ...media, src };
  }
  if (kind === "link") {
    if (value === null) return null;
    const link = (typeof value === "string" ? { kind: "url", href: value } : value) as Record<
      string,
      unknown
    >;
    if (link.kind === "page" || (!link.kind && typeof link.pageId === "string")) {
      const href = hrefs.get(String(link.pageId));
      if (!href)
        throw new AgentError(
          `« ${path} » : page « ${String(link.pageId)} » introuvable pour ce lien.`,
        );
      return { kind: "page", pageId: link.pageId, href, newTab: link.newTab === true || undefined };
    }
    const href = String(link.href ?? "").trim();
    if (!isSafeHref(href))
      throw new AgentError(`« ${path} » : lien refusé (https://, mailto:, tel: ou /… attendu).`);
    return { kind: "url", href, newTab: link.newTab === true || undefined };
  }
  if (field.type === "richtext" && typeof value === "string") return sanitizeRichText(value);
  if (field.type === "array" && Array.isArray(value)) {
    const itemFields = (field.arrayFields ?? {}) as Record<string, Field>;
    return value.map((item, i) =>
      normalizeObject(itemFields, item, `${path}[${i}]`, hrefs, field.defaultItemProps),
    );
  }
  if (field.type === "object" && value && typeof value === "object") {
    return normalizeObject((field.objectFields ?? {}) as Record<string, Field>, value, path, hrefs);
  }
  return value;
}

function normalizeObject(
  fields: Record<string, Field>,
  value: unknown,
  path: string,
  hrefs: Map<string, string>,
  defaults?: object,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentError(`« ${path} » : objet attendu.`);
  }
  const out: Record<string, unknown> = { ...(defaults ?? {}) };
  for (const [key, sub] of Object.entries(value as Record<string, unknown>)) {
    const field = fields[key];
    if (!field)
      throw new AgentError(
        `« ${path}.${key} » : champ inconnu. Champs possibles : ${Object.keys(fields).join(", ")}.`,
      );
    out[key] = normalizeValue(field, sub, `${path}.${key}`, hrefs);
  }
  return out;
}

async function hrefsByPageId(ctx: AgentContext): Promise<Map<string, string>> {
  const pages = await ctx.backend.listPages();
  return new Map(pages.map((p) => [p.id, slugToPath(p.slug)]));
}

/** Applies `path → value` changes to props, with validation of paths and values. */
function applyChanges(
  fields: Record<string, Field>,
  props: Record<string, unknown>,
  changes: Record<string, unknown>,
  hrefs: Map<string, string>,
): Record<string, unknown> {
  let next: Record<string, unknown> = { ...props };
  for (const [path, value] of Object.entries(changes)) {
    const segments = parsePath(path);
    if (segments[0] === "id" || segments[0] === STYLE_KEY) {
      throw new AgentError(
        `« ${path} » ne peut pas être modifié ici${segments[0] === STYLE_KEY ? " : utilisez set_style" : ""}.`,
      );
    }
    const field = fieldAt(fields, segments, path);
    const normalized =
      typeof segments[segments.length - 1] === "number"
        ? normalizeObject(
            (field as { objectFields: Record<string, Field> }).objectFields,
            value,
            path,
            hrefs,
          )
        : normalizeValue(field, value, path, hrefs);
    next = setAt(next, segments, normalized) as Record<string, unknown>;
  }
  return next;
}

function check(data: Data, config: OpenFlowConfig, page?: Pick<AgentPage, "slug" | "collection">) {
  const issues = [
    ...validatePageData(data, config),
    // The address is checked when it changes (update_page), not at each edit of the content.
    ...(page ? validateItem({ ...page, data }, config, undefined, { address: false }) : []),
  ];
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0)
    throw new AgentError(`Modification refusée : ${errors.map((e) => e.message).join(" ; ")}`);
  return issues.map((issue) => issue.message);
}

/** Saves a page's content; an item's title and summary follow its section. */
async function saveData(ctx: AgentContext, page: AgentPage, data: Data) {
  const collection = getCollectionConfig(ctx.config, page.collection);
  await ctx.backend.savePageData(
    page.id,
    data,
    collection ? itemMeta(data, collection, ctx.config) : undefined,
  );
}

function newSectionId(type: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${type}-${random}`;
}

function describeField(field: FieldSchema): Record<string, unknown> {
  const formats: Record<string, string> = {
    text: "texte sur une ligne",
    textarea: "texte (retours à la ligne admis)",
    richtext: "HTML simple : <p>, <strong>, <em>, <a href>, <ul>/<ol>/<li>, <h2>-<h4>",
    number: "nombre",
    image:
      '{ "src": "https://… ou /…", "alt": "description de l\'image" } ou null (voir list_media / import_media)',
    video: '{ "src": "https://….mp4", "poster": "https://….jpg", "description": "…" } ou null',
    link: '{ "kind": "page", "pageId": "a-propos" } ou { "kind": "url", "href": "https://…", "newTab": true } ou null',
    select: "une des valeurs de « options »",
    radio: "une des valeurs de « options »",
    array: "liste d'objets (voir « item »)",
    object: "objet (voir « fields »)",
    slot: "sections imbriquées (non modifiable par ces outils)",
    other: "valeur spécifique au site",
  };
  return {
    type: field.type,
    label: field.label,
    format: formats[field.type],
    options: field.options?.map((o) => ({ value: o.value, label: o.label })),
    item: field.type === "array" ? describeFields(field.fields) : undefined,
    fields: field.type === "object" ? describeFields(field.fields) : undefined,
    min: field.min,
    max: field.max,
  };
}

function describeFields(fields: Record<string, FieldSchema> | undefined) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([key, field]) => [key, describeField(field)]),
  );
}

function sectionSummary(ctx: AgentContext, item: ComponentData) {
  const { id, [STYLE_KEY]: style, ...values } = item.props as Record<string, unknown>;
  return {
    id,
    type: item.type,
    label: ctx.schema.sections[item.type]?.label ?? item.type,
    values,
    ...(style ? { style } : {}),
  };
}

async function uniquePageId(ctx: AgentContext, base: string): Promise<string> {
  const pages = await ctx.backend.listPages();
  const ids = new Set(pages.map((p) => p.id));
  let id = base || "page";
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  return id;
}

async function assertFreeSlug(ctx: AgentContext, slug: string, exceptId?: string) {
  if (!isValidSlug(slug))
    throw new AgentError(`Adresse invalide « ${slug} » : minuscules, chiffres et tirets.`);
  const pages = await ctx.backend.listPages();
  const other = pages.find((p) => p.slug === slug && p.id !== exceptId);
  if (other)
    throw new AgentError(
      `L'adresse ${slugToPath(slug)} est déjà utilisée par la page « ${other.title} ».`,
    );
}

const SCREEN = { all: "base", tablet: "tablet", mobile: "mobile" } as const;

const seoInput = z
  .object({
    title: z.string().optional().describe("Titre affiché dans Google et l'onglet du navigateur."),
    description: z
      .string()
      .optional()
      .describe("Description pour Google (150 caractères environ)."),
    noindex: z.boolean().optional().describe("true : la page n'apparaît pas dans Google."),
  })
  .optional();

// ---------------------------------------------------------------------------------------------
// Tools

const tools: ToolDefinition<any>[] = [];

function tool<I extends z.ZodType>(definition: ToolDefinition<I>) {
  tools.push(definition);
}

tool({
  name: "get_site_overview",
  title: "Vue d'ensemble du site",
  description:
    "Vue d'ensemble du site : pages, types de sections disponibles, réglages communs, thème et dernière publication. À appeler en premier.",
  input: z.object({}),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (_input, ctx) => {
    const [pages, settings, releases] = await Promise.all([
      ctx.backend.listPages(),
      ctx.backend.getSettings(),
      ctx.backend.listReleases(1),
    ]);
    const theme = ctx.schema.theme;
    return {
      site: { name: settings.site.name, url: settings.site.url, lang: settings.site.lang },
      pages: pages
        .filter((p) => !p.collection)
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .map((p) => ({
          id: p.id,
          title: p.title,
          path: slugToPath(p.slug),
          status: p.status,
          sections: p.data.content.map((item) => item.type),
          updatedAt: p.updatedAt,
        })),
      collections: Object.entries(ctx.config.collections ?? {}).map(([name, collection]) => {
        const items = pages.filter((p) => p.collection === name);
        const latest = buildCollections(
          items.map((p) => ({ ...p, status: "published" as const })),
          ctx.config,
        )[name]?.slice(0, 5);
        return {
          name,
          label: collection.label,
          path: `/${collection.path}/`,
          itemSection: collection.component,
          titleField: titleFieldOf(collection),
          dateField: collection.dateField,
          count: items.length,
          latest: latest?.map((entry) => ({
            id: entry.id,
            title: entry.title,
            path: entry.href,
            date: entry.date,
            status: items.find((p) => p.id === entry.id)?.status,
          })),
        };
      }),
      sectionTypes: Object.entries(ctx.schema.sections)
        .filter(([type]) => !itemComponents(ctx.config).has(type))
        .map(([type, section]) => ({
          type,
          label: section.label,
          category: section.category,
        })),
      settings: Object.entries(ctx.schema.settings?.fields ?? {}).map(([key, field]) => ({
        key,
        label: field.label,
        type: field.type,
      })),
      theme: theme
        ? {
            colors: (theme.colors ?? []).map((t) => ({
              token: `color-${t.token}`,
              label: t.label,
              value: settings.theme[`color-${t.token}`] ?? t.value,
            })),
            fonts: (theme.fonts ?? []).map((t) => ({
              token: `font-${t.token}`,
              label: t.label,
              value: settings.theme[`font-${t.token}`] ?? t.value,
            })),
            fontOptions: theme.fontOptions ?? [],
          }
        : null,
      business: settings.site.business
        ? businessLines(settings.site, today()).map((l) => l.replace(/^\s*- /, ""))
        : null,
      freeStyle: ctx.schema.styles === "free",
      lastPublication: releases[0] ?? null,
      notes: [
        "Toutes les modifications sont enregistrées en brouillon : rien n'est en ligne avant publish.",
        "Pour modifier un texte : get_page, puis update_section avec le chemin du champ (ex. « title » ou « items[1].answer »).",
        "Collections (articles, réalisations…) : list_items, create_item ; un élément est une page (get_page, update_section, update_page, delete_page), dont la section « itemSection » porte les champs.",
        "Coordonnées, horaires et fermetures exceptionnelles de l'établissement : get_settings (« business »), puis update_business.",
        "Demandez confirmation au propriétaire avant publish, delete_page et remove_section.",
      ],
    };
  },
});

tool({
  name: "list_section_types",
  title: "Types de sections",
  description:
    "Détail des types de sections disponibles : champs, format attendu de chaque valeur et valeurs par défaut. Utile avant add_section ou update_section.",
  input: z.object({
    types: z.array(z.string()).optional().describe("Types à détailler (tous par défaut)."),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async ({ types }, ctx) =>
    Object.entries(ctx.schema.sections)
      .filter(([type]) => !types?.length || types.includes(type))
      .map(([type, section]) => ({
        type,
        label: section.label,
        category: section.category,
        fields: describeFields(section.fields),
        defaults: section.defaults,
      })),
});

tool({
  name: "get_page",
  title: "Lire une page",
  description:
    "Contenu d'une page : titre, adresse, référencement et sections dans l'ordre, avec les valeurs de leurs champs et leur style.",
  input: z.object({ pageId: pageRef }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async ({ pageId }, ctx) => {
    const page = await findPage(ctx, pageId);
    const data = applyDefaults(page.data, ctx.config);
    return {
      id: page.id,
      title: page.title,
      path: slugToPath(page.slug),
      status: page.status,
      ...(page.collection ? { collection: page.collection } : {}),
      seo: page.seo,
      sections: data.content.map((item) => sectionSummary(ctx, item)),
    };
  },
});

tool({
  name: "update_section",
  title: "Modifier une section",
  description:
    "Modifie des champs d'une section. « changes » associe un chemin de champ à sa nouvelle valeur : « title », « items[1].answer », « image », ou « items » pour remplacer toute une liste. Les autres champs ne changent pas.",
  input: z.object({
    pageId: pageRef,
    sectionId: sectionRef,
    changes: z
      .record(z.string(), z.unknown())
      .describe('Chemin → valeur, ex. { "title": "Nouveau titre", "items[0].answer": "…" }.'),
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  run: async ({ pageId, sectionId, changes }, ctx) => {
    if (Object.keys(changes).length === 0) throw new AgentError("Aucune modification demandée.");
    const page = await findPage(ctx, pageId);
    const data = structuredClone(page.data);
    const { list, index, item } = requireSection(data, sectionId);
    const fields = sectionFields(ctx, item.type);
    const props = applyChanges(fields, item.props, changes, await hrefsByPageId(ctx));
    list[index] = { ...item, props: props as ComponentData["props"] };
    const warnings = check(data, ctx.config, page);
    await saveData(ctx, page, data);
    return { ok: true, section: sectionSummary(ctx, list[index] as ComponentData), warnings };
  },
});

tool({
  name: "add_section",
  title: "Ajouter une section",
  description:
    "Ajoute une section à une page, remplie avec ses valeurs par défaut puis « values ». Par défaut à la fin de la page, sinon après « afterSectionId » ou à la « position » donnée (0 = en haut).",
  input: z.object({
    pageId: pageRef,
    type: z.string().describe("Type de section (voir get_site_overview ou list_section_types)."),
    values: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Valeurs des champs (chemin → valeur)."),
    afterSectionId: z.string().optional(),
    position: z.number().int().min(0).optional(),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ pageId, type, values, afterSectionId, position }, ctx) => {
    const page = await findPage(ctx, pageId);
    const fields = sectionFields(ctx, type);
    const defaults = structuredClone(ctx.config.components[type]?.defaultProps ?? {}) as Record<
      string,
      unknown
    >;
    const id = newSectionId(type);
    const props = applyChanges(fields, { ...defaults, id }, values ?? {}, await hrefsByPageId(ctx));
    const data = structuredClone(page.data);
    const index =
      afterSectionId !== undefined
        ? data.content.findIndex((item) => item.props.id === afterSectionId) + 1
        : Math.min(position ?? data.content.length, data.content.length);
    if (afterSectionId !== undefined && index === 0) {
      throw new AgentError(
        `Section « ${afterSectionId} » introuvable au premier niveau de la page.`,
      );
    }
    data.content.splice(index, 0, { type, props: props as ComponentData["props"] });
    const warnings = check(data, ctx.config, page);
    await saveData(ctx, page, data);
    return { ok: true, sectionId: id, position: index, warnings };
  },
});

tool({
  name: "duplicate_section",
  title: "Dupliquer une section",
  description: "Copie une section (contenu et style) juste en dessous d'elle-même.",
  input: z.object({ pageId: pageRef, sectionId: sectionRef }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ pageId, sectionId }, ctx) => {
    const page = await findPage(ctx, pageId);
    const data = structuredClone(page.data);
    const { list, index, item } = requireSection(data, sectionId);
    const copy = structuredClone(item);
    copy.props.id = newSectionId(item.type);
    list.splice(index + 1, 0, copy);
    check(data, ctx.config, page);
    await saveData(ctx, page, data);
    return { ok: true, sectionId: copy.props.id, position: index + 1 };
  },
});

tool({
  name: "move_section",
  title: "Déplacer une section",
  description: "Déplace une section à une nouvelle position dans sa page (0 = en haut).",
  input: z.object({ pageId: pageRef, sectionId: sectionRef, position: z.number().int().min(0) }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  run: async ({ pageId, sectionId, position }, ctx) => {
    const page = await findPage(ctx, pageId);
    const data = structuredClone(page.data);
    const { list, index, item } = requireSection(data, sectionId);
    list.splice(index, 1);
    const target = Math.min(position, list.length);
    list.splice(target, 0, item);
    await saveData(ctx, page, data);
    return { ok: true, order: list.map((section) => section.props.id) };
  },
});

tool({
  name: "remove_section",
  title: "Supprimer une section",
  description:
    "Supprime une section de la page (brouillon). Demandez confirmation au propriétaire avant de l'utiliser.",
  input: z.object({ pageId: pageRef, sectionId: sectionRef }),
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  run: async ({ pageId, sectionId }, ctx) => {
    const page = await findPage(ctx, pageId);
    const data = structuredClone(page.data);
    const { list, index, item } = requireSection(data, sectionId);
    list.splice(index, 1);
    check(data, ctx.config, page);
    await saveData(ctx, page, data);
    return { ok: true, removed: { id: item.props.id, type: item.type } };
  },
});

const styleInput = z
  .record(z.string(), z.unknown())
  .describe(
    `Propriétés de style (null pour revenir à la valeur d'origine) : ${STYLE_PROPERTIES.join(", ")}. Couleurs « #rrggbb » ou « var(--color-jeton) », longueurs « 24px », « 1.5rem », « 80% ».`,
  );

tool({
  name: "set_style",
  title: "Changer le style",
  description:
    "Change le style d'une section ou d'un de ses éléments (texte, image), pour tous les écrans ou seulement la tablette ou le mobile. « element » est le chemin du champ sans indice (« title », « items.answer ») ; sans « element », le style s'applique à la section entière.",
  input: z.object({
    pageId: pageRef,
    sectionId: sectionRef,
    element: z.string().optional(),
    screen: z.enum(["all", "tablet", "mobile"]).default("all"),
    style: styleInput,
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  run: async ({ pageId, sectionId, element, screen, style }, ctx) => {
    if (ctx.schema.styles === "off")
      throw new AgentError("Le style libre est désactivé pour ce site.");
    const page = await findPage(ctx, pageId);
    const data = structuredClone(page.data);
    const { list, index, item } = requireSection(data, sectionId);
    if (element) {
      const paths = collectEditablePaths(sectionFields(ctx, item.type) as Fields).map(
        (p) => p.path,
      );
      if (!paths.includes(element)) {
        throw new AgentError(
          `Élément « ${element} » inconnu. Éléments de cette section : ${paths.join(", ")}.`,
        );
      }
    }
    const bp = SCREEN[screen];
    const current: SectionStyle = sanitizeStyle(item.props[STYLE_KEY]) ?? {};
    const responsive: ResponsiveStyle =
      (element ? current.fields?.[element] : current.section) ?? {};
    const values: Record<string, unknown> = { ...(responsive[bp] ?? {}) };
    const rejected: string[] = [];
    for (const [key, value] of Object.entries(style)) {
      if (!STYLE_PROPERTIES.includes(key as StyleProperty)) {
        rejected.push(`${key} (propriété inconnue)`);
        continue;
      }
      if (value === null) {
        delete values[key];
        continue;
      }
      const parsed = styleValuesSchema.shape[key as StyleProperty].safeParse(value);
      if (parsed.success) values[key] = parsed.data;
      else rejected.push(`${key} = ${JSON.stringify(value)}`);
    }
    if (rejected.length > 0) throw new AgentError(`Valeurs refusées : ${rejected.join(", ")}.`);
    const nextResponsive = { ...responsive, [bp]: values };
    const next = sanitizeStyle(
      element
        ? { ...current, fields: { ...current.fields, [element]: nextResponsive } }
        : { ...current, section: nextResponsive },
    );
    const props: Record<string, unknown> = { ...item.props };
    if (next) props[STYLE_KEY] = next;
    else delete props[STYLE_KEY];
    list[index] = { ...item, props: props as ComponentData["props"] };
    await saveData(ctx, page, data);
    return { ok: true, style: next ?? null };
  },
});

tool({
  name: "create_page",
  title: "Créer une page",
  description:
    "Crée une page, vide ou avec des sections. Statut « draft » par défaut (absente du site) ; « published » l'ajoute au site à la prochaine publication.",
  input: z.object({
    title: z.string().min(1),
    path: z
      .string()
      .optional()
      .describe("Adresse, ex. « /nos-tarifs/ » (déduite du titre par défaut)."),
    status: z.enum(["draft", "published"]).default("draft"),
    sections: z
      .array(z.object({ type: z.string(), values: z.record(z.string(), z.unknown()).optional() }))
      .optional(),
    seo: seoInput,
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ title, path, status, sections, seo }, ctx) => {
    const slug = normalizeSlug(path ?? title);
    for (const [name, collection] of Object.entries(ctx.config.collections ?? {})) {
      if (slug.startsWith(`${collection.path}/`)) {
        throw new AgentError(
          `L'adresse ${slugToPath(slug)} est réservée à la collection « ${collection.label} » : utilisez create_item avec collection « ${name} ».`,
        );
      }
    }
    await assertFreeSlug(ctx, slug);
    const hrefs = await hrefsByPageId(ctx);
    const content = (sections ?? []).map(({ type, values }) => {
      const fields = sectionFields(ctx, type);
      const defaults = structuredClone(ctx.config.components[type]?.defaultProps ?? {}) as Record<
        string,
        unknown
      >;
      const props = applyChanges(
        fields,
        { ...defaults, id: newSectionId(type) },
        values ?? {},
        hrefs,
      );
      return { type, props: props as ComponentData["props"] };
    });
    const data: Data = { root: { props: {} }, content };
    check(data, ctx.config, { slug });
    const id = await uniquePageId(ctx, slugify(title) || slug.split("/").pop() || "page");
    await ctx.backend.createPage(id, { slug, title, status, seo: seo ?? {}, data });
    return { ok: true, pageId: id, path: slugToPath(slug), status };
  },
});

const collectionRef = z
  .string()
  .min(1)
  .describe("Nom de la collection (voir « collections » dans get_site_overview).");

function requireCollection(ctx: AgentContext, name: string) {
  const collection = getCollectionConfig(ctx.config, name);
  if (!collection) {
    const names = Object.keys(ctx.config.collections ?? {});
    throw new AgentError(
      `Collection « ${name} » inconnue. Collections du site : ${names.join(", ") || "aucune"}.`,
    );
  }
  return collection;
}

tool({
  name: "list_items",
  title: "Lister les éléments d'une collection",
  description:
    "Éléments d'une collection (articles, réalisations…), dans l'ordre du site : titre, adresse, date, statut et valeurs principales. « query » filtre sur le titre.",
  input: z.object({
    collection: collectionRef,
    query: z.string().optional(),
    status: z.enum(["draft", "published"]).optional(),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async ({ collection: name, query, status }, ctx) => {
    requireCollection(ctx, name);
    const pages = (await ctx.backend.listPages()).filter(
      (p) => p.collection === name && (!status || p.status === status),
    );
    const byId = new Map(pages.map((p) => [p.id, p]));
    const entries =
      buildCollections(
        pages.map((p) => ({ ...p, status: "published" as const })),
        ctx.config,
      )[name] ?? [];
    const needle = query?.trim().toLowerCase();
    const items = entries
      .filter((entry) => !needle || entry.title.toLowerCase().includes(needle))
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        path: entry.href,
        status: byId.get(entry.id)?.status,
        date: entry.date,
        description: entry.description,
        fields: entry.fields,
        updatedAt: byId.get(entry.id)?.updatedAt,
      }));
    return { collection: name, count: items.length, items };
  },
});

tool({
  name: "create_item",
  title: "Ajouter un élément à une collection",
  description:
    "Crée un élément d'une collection (un article, une réalisation…) avec sa page : « values » remplit les champs de sa section (voir list_section_types pour « itemSection »). Statut « draft » par défaut (absent du site).",
  input: z.object({
    collection: collectionRef,
    title: z.string().min(1),
    values: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Valeurs des champs de la section de l'élément (chemin → valeur)."),
    date: z
      .string()
      .optional()
      .describe(
        "Date de publication AAAA-MM-JJ (aujourd'hui par défaut), si la collection en a une.",
      ),
    path: z
      .string()
      .optional()
      .describe("Dernière partie de l'adresse (déduite du titre par défaut)."),
    status: z.enum(["draft", "published"]).default("draft"),
    seo: seoInput,
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ collection: name, title, values, date, path, status, seo }, ctx) => {
    const collection = requireCollection(ctx, name);
    if (date !== undefined && !isValidDate(date))
      throw new AgentError(`Date invalide « ${date} » : AAAA-MM-JJ attendu.`);
    const slug = path
      ? `${collection.path}/${normalizeSlug(path).split("/").pop() || "element"}`
      : itemSlug(collection, title);
    await assertFreeSlug(ctx, slug);
    const data = newItemData(collection, ctx.config, {
      title,
      date: date ?? today(),
      id: newSectionId(collection.component),
    });
    const item = data.content[0] as ComponentData;
    item.props = applyChanges(
      sectionFields(ctx, collection.component),
      item.props,
      values ?? {},
      await hrefsByPageId(ctx),
    ) as ComponentData["props"];
    // The title given here wins over a title value.
    (item.props as Record<string, unknown>)[titleFieldOf(collection)] = title;
    const warnings = check(data, ctx.config, { slug, collection: name });
    const id = await uniquePageId(ctx, slugify(title) || "element");
    const meta = itemMeta(data, collection, ctx.config);
    await ctx.backend.createPage(id, {
      slug,
      title: meta.title ?? title,
      status,
      seo: seo ?? {},
      data,
      collection: name,
      summary: meta.summary,
    });
    return { ok: true, pageId: id, path: slugToPath(slug), status, warnings };
  },
});

tool({
  name: "update_page",
  title: "Modifier une page",
  description:
    "Change le titre, l'adresse, le statut (published / draft) ou le référencement d'une page.",
  input: z.object({
    pageId: pageRef,
    title: z.string().min(1).optional(),
    path: z.string().optional(),
    status: z.enum(["draft", "published"]).optional(),
    seo: seoInput,
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  run: async ({ pageId, title, path, status, seo }, ctx) => {
    const page = await findPage(ctx, pageId);
    const collection = getCollectionConfig(ctx.config, page.collection);
    const meta: Partial<Pick<AgentPage, "title" | "slug" | "status" | "seo">> = {};
    if (title !== undefined) meta.title = title;
    if (path !== undefined) {
      if (page.slug === "" && normalizeSlug(path) !== "")
        throw new AgentError("La page d'accueil garde l'adresse « / ».");
      meta.slug = normalizeSlug(path);
      if (collection && !meta.slug.startsWith(`${collection.path}/`)) {
        meta.slug = `${collection.path}/${meta.slug.split("/").pop()}`;
      }
      await assertFreeSlug(ctx, meta.slug, page.id);
    }
    // An item's title is its section's title field: both change together.
    if (collection && title !== undefined) {
      await saveData(ctx, page, setItemTitle(page.data, collection, title));
    }
    if (status !== undefined) meta.status = status;
    if (seo !== undefined) meta.seo = { ...page.seo, ...seo };
    if (Object.keys(meta).length === 0) throw new AgentError("Aucune modification demandée.");
    await ctx.backend.savePageMeta(page.id, meta);
    return { ok: true, pageId: page.id, path: slugToPath(meta.slug ?? page.slug) };
  },
});

tool({
  name: "delete_page",
  title: "Supprimer une page",
  description:
    "Supprime définitivement une page (brouillon et contenu). Irréversible : demandez confirmation au propriétaire, puis passez confirm: true.",
  input: z.object({ pageId: pageRef, confirm: z.literal(true) }),
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  run: async ({ pageId }, ctx) => {
    const page = await findPage(ctx, pageId);
    if (page.slug === "") throw new AgentError("La page d'accueil ne peut pas être supprimée.");
    await ctx.backend.deletePage(page.id);
    return { ok: true, deleted: page.id };
  },
});

tool({
  name: "get_settings",
  title: "Lire les réglages communs",
  description:
    "Contenu commun à toutes les pages (menu, pied de page, coordonnées…) : champs et valeurs.",
  input: z.object({}),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (_input, ctx) => {
    const settings = await ctx.backend.getSettings();
    return {
      fields: describeFields(ctx.schema.settings?.fields),
      values: { ...(ctx.schema.settings?.defaults ?? {}), ...settings.values },
      business: settings.site.business ?? null,
    };
  },
});

const timeRangeInput = z.object({
  opens: z.string().describe("« 09:00 »"),
  closes: z.string().describe("« 12:30 »"),
});

tool({
  name: "update_business",
  title: "Modifier la fiche établissement",
  description:
    "Coordonnées, adresse, horaires et fermetures exceptionnelles de l'établissement, lus par Google, les IA et le site. Seuls les champs donnés changent ; null en efface un. « hours » : jour (mo, tu, we, th, fr, sa, su) → plages horaires, [] pour un jour fermé. « closures » remplace toute la liste des fermetures exceptionnelles (lisez-la d'abord avec get_settings) ; « addClosure » en ajoute une.",
  input: z.object({
    type: z
      .enum(BUSINESS_TYPES.map((t) => t.value) as [string, ...string[]])
      .nullable()
      .optional()
      .describe("Activité (type schema.org)."),
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    street: z.string().nullable().optional(),
    postalCode: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    country: z.string().nullable().optional().describe("Code pays ISO, « FR » par défaut."),
    hours: z
      .partialRecord(z.enum(WEEKDAYS), z.array(timeRangeInput))
      .nullable()
      .optional()
      .describe("Horaires de la semaine ; les jours absents ne changent pas."),
    hoursNote: z.string().nullable().optional().describe("« Sur rendez-vous le lundi »."),
    closures: z
      .array(
        z.object({ from: z.string(), to: z.string().optional(), label: z.string().optional() }),
      )
      .nullable()
      .optional(),
    addClosure: z
      .object({
        from: z.string().describe("AAAA-MM-JJ"),
        to: z.string().optional().describe("AAAA-MM-JJ, inclus"),
        label: z.string().optional().describe("« Congés d'été »"),
      })
      .optional(),
    priceRange: z.enum(["€", "€€", "€€€", "€€€€"]).nullable().optional(),
    areaServed: z.string().nullable().optional(),
    links: z
      .array(z.string())
      .nullable()
      .optional()
      .describe("Fiche Google, réseaux sociaux (https://…)."),
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  run: async ({ addClosure, hours, ...changes }, ctx) => {
    const settings = await ctx.backend.getSettings();
    const next: Record<string, unknown> = { ...(settings.site.business ?? {}) };
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      if (value === null || value === "") delete next[key];
      else next[key] = value;
    }
    if (hours === null) delete next.hours;
    else if (hours) next.hours = { ...(next.hours as object), ...hours };
    if (addClosure) {
      next.closures = [...((next.closures as unknown[]) ?? []), addClosure];
    }
    const parsed = businessSchema.safeParse(next);
    if (!parsed.success) {
      throw new AgentError(
        `Fiche refusée : ${parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ")}`,
      );
    }
    const business = sanitizeBusiness(parsed.data) ?? null;
    await ctx.backend.saveBusiness(business);
    return {
      ok: true,
      business,
      summary: business ? businessLines({ ...settings.site, business }, today()) : [],
      note: "Enregistré en brouillon : en ligne à la prochaine publication.",
    };
  },
});

tool({
  name: "update_settings",
  title: "Modifier les réglages communs",
  description:
    "Modifie le contenu commun à toutes les pages. « changes » : chemin → valeur, comme update_section.",
  input: z.object({ changes: z.record(z.string(), z.unknown()) }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  run: async ({ changes }, ctx) => {
    const fields = (ctx.config.settings?.fields ?? {}) as Record<string, Field>;
    if (Object.keys(fields).length === 0)
      throw new AgentError("Ce site n'a pas de réglages communs.");
    const settings = await ctx.backend.getSettings();
    const current = { ...(ctx.config.settings?.defaultProps ?? {}), ...settings.values };
    const values = applyChanges(fields, current, changes, await hrefsByPageId(ctx));
    const errors = validateSettingsValues(values, ctx.config).filter((i) => i.severity === "error");
    if (errors.length > 0)
      throw new AgentError(`Modification refusée : ${errors.map((e) => e.message).join(" ; ")}`);
    await ctx.backend.saveSettingsValues(values);
    return { ok: true, changed: Object.keys(changes) };
  },
});

tool({
  name: "set_theme",
  title: "Changer le thème",
  description:
    "Change les couleurs et polices du thème (tout le site). « tokens » associe un jeton (ex. « color-ink », « font-display », voir get_site_overview) à une valeur, ou à null pour revenir à la valeur d'origine.",
  input: z.object({ tokens: z.record(z.string(), z.string().nullable()) }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  run: async ({ tokens }, ctx) => {
    const theme = ctx.schema.theme;
    if (!theme) throw new AgentError("Ce site ne déclare pas de thème modifiable.");
    const allowed = new Map<string, "color" | "font">([
      ...(theme.colors ?? []).map((t) => [`color-${t.token}`, "color"] as const),
      ...(theme.fonts ?? []).map((t) => [`font-${t.token}`, "font"] as const),
    ]);
    const fonts = new Set([
      ...(theme.fontOptions ?? []).map((f) => f.value),
      "system-ui",
      "sans-serif",
      "serif",
      "monospace",
    ]);
    const next = { ...(await ctx.backend.getSettings()).theme };
    for (const [key, value] of Object.entries(tokens)) {
      const kind = allowed.get(key);
      if (!kind)
        throw new AgentError(
          `Jeton inconnu « ${key} ». Jetons : ${[...allowed.keys()].join(", ")}.`,
        );
      if (value === null) {
        delete next[key];
        continue;
      }
      if (kind === "font" && !fonts.has(value)) {
        throw new AgentError(
          `Police « ${value} » non disponible. Choix : ${[...fonts].join(", ")}.`,
        );
      }
      if (sanitizeTheme({ [key]: value })[key] !== value)
        throw new AgentError(`Valeur refusée pour ${key} : « ${value} ».`);
      next[key] = value;
    }
    await ctx.backend.saveTheme(sanitizeTheme(next));
    return { ok: true, theme: sanitizeTheme(next) };
  },
});

tool({
  name: "list_media",
  title: "Médiathèque",
  description:
    "Images et vidéos de la médiathèque, avec l'adresse à utiliser dans un champ image ou vidéo.",
  input: z.object({ kind: z.enum(["image", "video"]).optional() }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async ({ kind }, ctx) =>
    (await ctx.backend.listMedia())
      .filter((m) => !kind || m.contentType.startsWith(`${kind}/`))
      .slice(0, 200)
      .map((m) => ({
        url: m.url,
        name: m.name,
        alt: m.alt,
        type: m.contentType,
        width: m.width,
        height: m.height,
        origin: m.source === "static" ? "fichier du site" : "importé",
      })),
});

tool({
  name: "import_media",
  title: "Importer une image",
  description:
    "Copie une image (PNG, JPEG, GIF, WebP, AVIF) ou une vidéo (MP4, WebM) publique dans la médiathèque, à partir de son adresse https. Renvoie la valeur à mettre dans un champ image.",
  input: z.object({
    url: z.string().url().describe("Adresse https du fichier."),
    alt: z.string().optional().describe("Description de l'image pour l'accessibilité."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  run: async ({ url, alt }, ctx) => {
    if (!/^https:\/\//i.test(url))
      throw new AgentError("Seules les adresses https sont acceptées.");
    const media = await ctx.backend.importMedia(url, alt);
    const video = media.contentType.startsWith("video/");
    return {
      ok: true,
      value: video
        ? { src: media.url }
        : { src: media.url, alt: alt ?? "", width: media.width, height: media.height },
    };
  },
});

tool({
  name: "publish",
  title: "Publier le site",
  description:
    "Met le site en ligne avec toutes les modifications enregistrées (pages « published »). Demandez confirmation au propriétaire avant de publier.",
  input: z.object({}),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  run: async (_input, ctx) => {
    const { releaseId } = await ctx.backend.publish();
    return {
      ok: true,
      releaseId,
      message:
        "Publication lancée : le site sera en ligne dans quelques minutes (voir get_publication_status).",
    };
  },
});

tool({
  name: "get_publication_status",
  title: "État des publications",
  description: "Dernières publications du site et leur état (en cours, en ligne, échec).",
  input: z.object({}),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (_input, ctx) => {
    const labels: Record<ReleaseStatus, string> = {
      queued: "en attente",
      building: "en cours",
      live: "en ligne",
      failed: "échec",
      superseded: "remplacée",
    };
    return (await ctx.backend.listReleases(5)).map((r) => ({ ...r, label: labels[r.status] }));
  },
});

// ---------------------------------------------------------------------------------------------
// Registry

export interface AgentToolInfo {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
}

function jsonSchema(input: z.ZodType): Record<string, unknown> {
  const { $schema: _schema, ...schema } = z.toJSONSchema(input, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  return schema;
}

/** The tools, as advertised to MCP / WebMCP clients. */
export const AGENT_TOOLS: AgentToolInfo[] = tools.map((t) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: jsonSchema(t.input),
  annotations: { title: t.title, ...t.annotations },
}));

/** Instructions given to the AI when it connects. */
export function agentInstructions(siteName: string): string {
  return [
    `Vous modifiez le site « ${siteName} » (OpenFlow) pour son propriétaire.`,
    "Commencez par get_site_overview, puis get_page pour lire une page avant de la modifier.",
    "Toutes les modifications sont des brouillons : elles ne sont en ligne qu'après publish.",
    "Demandez confirmation avant publish, remove_section et delete_page. Écrivez dans la langue du site.",
  ].join(" ");
}

/** Runs a tool; `AgentError` carries a message meant for the AI. */
export async function runAgentTool(
  name: string,
  args: unknown,
  ctx: AgentContext,
): Promise<unknown> {
  const definition = tools.find((t) => t.name === name);
  if (!definition) throw new AgentError(`Outil inconnu « ${name} ».`);
  const parsed = (definition.input as z.ZodType).safeParse(args ?? {});
  if (!parsed.success) {
    throw new AgentError(
      `Paramètres invalides : ${parsed.error.issues.map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`).join(" ; ")}`,
    );
  }
  return definition.run(parsed.data, ctx);
}
