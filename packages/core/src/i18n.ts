import type { ComponentData, Data, Field, Fields } from "@puckeditor/core";
import type { OpenFlowConfig } from "./config.js";
import { getOpenFlowFieldKind, type ImageValue } from "./fields.js";
import type { PageSeo } from "./model.js";
import { walkComponents } from "./walk.js";

/**
 * Multilingual sites. The default language (`site.lang`) holds the structure of every page: its
 * sections, images, links and styles. Another language (`site.locales`) only stores the texts
 * that change, keyed by section and field (`hero-1/title`, `faq/items[2].answer`,
 * `hero/image.alt`); what is not translated shows the default language's text. The translated
 * version of a page lives at `/<lang>/<address>/`.
 */

/** Languages a site can be written in, with their own name (language switcher, admin). */
export const LANGUAGES = [
  { code: "fr", label: "Français", french: "français" },
  { code: "en", label: "English", french: "anglais" },
  { code: "es", label: "Español", french: "espagnol" },
  { code: "de", label: "Deutsch", french: "allemand" },
  { code: "it", label: "Italiano", french: "italien" },
  { code: "pt", label: "Português", french: "portugais" },
  { code: "nl", label: "Nederlands", french: "néerlandais" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** At most this many languages besides the default one. */
export const MAX_LOCALES = 4;

export function isLanguage(code: unknown): code is LanguageCode {
  return LANGUAGES.some((language) => language.code === code);
}

/** « English », « Deutsch »… (the code itself for an unknown language). */
export function languageLabel(code: string): string {
  return LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

/** « anglais », « allemand »… for the owner's French interface. */
export function languageName(code: string): string {
  return LANGUAGES.find((language) => language.code === code)?.french ?? code;
}

/** The other languages of a site, valid and distinct from the default one. */
export function siteLocales(site: { lang?: string; locales?: string[] }): string[] {
  const main = site.lang || "fr";
  const out: string[] = [];
  for (const code of site.locales ?? []) {
    if (isLanguage(code) && code !== main && !out.includes(code)) out.push(code);
  }
  return out.slice(0, MAX_LOCALES);
}

/** A page's translation into one language (`cms_page_translations/{pageId}__{locale}`). */
export interface PageTranslation {
  title?: string;
  /** Address in this language, without the language prefix; the page's own address otherwise. */
  slug?: string;
  seo?: Pick<PageSeo, "title" | "description">;
  /** Translated texts: `sectionId/path` → text. */
  values: Record<string, string>;
  /** Fingerprint of each source text when it was translated, to flag the texts to review. */
  sources?: Record<string, string>;
}

/** The common content (menu, footer…) and the site's name in one language. */
export interface SettingsTranslation {
  site?: { name?: string; description?: string };
  /** Translated texts of the common content: `path` → text. */
  values: Record<string, string>;
  sources?: Record<string, string>;
}

/** Firestore id of a page's translation. */
export function translationId(pageId: string, locale: string): string {
  return `${pageId}__${locale}`;
}

// ---------------------------------------------------------------------------------------------
// Texts a translator changes

export interface TranslatableText {
  /** `sectionId/path` for a page, `path` for the common content. */
  key: string;
  /** Section id and type (pages only). */
  section?: string;
  sectionType?: string;
  /** Where the text is, in the owner's words: « En-tête › Titre », « Questions 2 › Réponse ». */
  label: string;
  kind: "text" | "textarea" | "richtext" | "alt";
  /** The text in the default language. */
  value: string;
}

const isImage = (value: unknown): value is ImageValue =>
  typeof value === "object" && value !== null && typeof (value as ImageValue).src === "string";

/** Texts of a set of fields (strings of text fields, image descriptions), with their paths. */
function fieldTexts(
  fields: Fields | undefined,
  props: Record<string, unknown>,
  prefix: string,
  labelPrefix: string,
  out: Array<Omit<TranslatableText, "key"> & { path: string }>,
) {
  for (const [name, field] of Object.entries((fields ?? {}) as Record<string, Field>)) {
    if (name.startsWith("_") || name === "id") continue;
    const value = props[name];
    const path = prefix ? `${prefix}.${name}` : name;
    const label = [labelPrefix, field.label || name].filter(Boolean).join(" › ");
    const kind = getOpenFlowFieldKind(field);
    if (kind === "image") {
      if (isImage(value) && typeof value.alt === "string" && value.alt.trim()) {
        out.push({
          path: `${path}.alt`,
          label: `${label} (description)`,
          kind: "alt",
          value: value.alt,
        });
      }
      continue;
    }
    if (kind) continue;
    if (field.type === "text" || field.type === "textarea" || field.type === "richtext") {
      if (typeof value === "string" && value.trim()) {
        out.push({ path, label, kind: field.type, value });
      }
    } else if (field.type === "array" && Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === "object") {
          fieldTexts(
            field.arrayFields as Fields,
            item as Record<string, unknown>,
            `${path}[${index}]`,
            `${field.label || name} ${index + 1}`,
            out,
          );
        }
      });
    } else if (field.type === "object" && value && typeof value === "object") {
      fieldTexts(field.objectFields as Fields, value as Record<string, unknown>, path, label, out);
    }
  }
}

/** Texts of one section, keyed `sectionId/path`. */
function sectionTexts(item: ComponentData, config: Pick<OpenFlowConfig, "components">) {
  const id = (item.props as Record<string, unknown>).id;
  const component = config.components[item.type];
  if (typeof id !== "string" || !id || !component) return [];
  const found: Array<Omit<TranslatableText, "key"> & { path: string }> = [];
  fieldTexts(component.fields as Fields, item.props as Record<string, unknown>, "", "", found);
  const title = component.label || item.type;
  return found.map(({ path, label, ...rest }) => ({
    ...rest,
    key: `${id}/${path}`,
    section: id,
    sectionType: item.type,
    label: `${title} › ${label}`,
  }));
}

/** Every text of a page a translator changes, in page order. */
export function pageTexts(
  data: Data,
  config: Pick<OpenFlowConfig, "components">,
): TranslatableText[] {
  const texts: TranslatableText[] = [];
  walkComponents(data, (item) => {
    texts.push(...sectionTexts(item, config));
  });
  return texts;
}

/** Every text of the common content (menu, footer…). */
export function settingsTexts(
  values: Record<string, unknown>,
  config: Pick<OpenFlowConfig, "settings">,
): TranslatableText[] {
  const found: Array<Omit<TranslatableText, "key"> & { path: string }> = [];
  fieldTexts(config.settings?.fields as Fields | undefined, values, "", "", found);
  return found.map(({ path, ...rest }) => ({ ...rest, key: path }));
}

// ---------------------------------------------------------------------------------------------
// Paths

type Token = string | number;

/** `items[1].answer` → `["items", 1, "answer"]`. */
function tokens(path: string): Token[] {
  const out: Token[] = [];
  for (const part of path.split(".")) {
    const match = /^([^[\]]+)((?:\[\d+\])*)$/.exec(part);
    if (!match) return [];
    out.push(match[1] as string);
    for (const index of (match[2] ?? "").matchAll(/\[(\d+)\]/g)) out.push(Number(index[1]));
  }
  return out;
}

/** Sets a value at a path of an object, in place (the path must exist up to its last step). */
function setAt(target: Record<string, unknown>, path: string, value: unknown): boolean {
  const steps = tokens(path);
  if (steps.length === 0) return false;
  let node: unknown = target;
  for (const step of steps.slice(0, -1)) {
    if (node === null || typeof node !== "object") return false;
    node = (node as Record<string | number, unknown>)[step];
  }
  if (node === null || typeof node !== "object") return false;
  (node as Record<string | number, unknown>)[steps.at(-1) as Token] = value;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Applying and collecting translations

/**
 * The page in another language: the default language's content where the translated texts
 * replace theirs. Only texts can change (a value for a link, an image or a style is ignored).
 */
export function applyPageTranslation(
  data: Data,
  config: Pick<OpenFlowConfig, "components">,
  values: Record<string, string> | undefined,
): Data {
  if (!values || Object.keys(values).length === 0) return data;
  const copy = structuredClone(data) as Data;
  walkComponents(copy, (item) => {
    for (const text of sectionTexts(item, config)) {
      const value = values[text.key];
      if (typeof value !== "string") continue;
      setAt(
        item.props as Record<string, unknown>,
        text.key.slice(text.key.indexOf("/") + 1),
        value,
      );
    }
  });
  return copy;
}

/** The common content in another language (same rule as the pages). */
export function applySettingsTranslation<T extends Record<string, unknown>>(
  values: T,
  config: Pick<OpenFlowConfig, "settings">,
  translation: Record<string, string> | undefined,
): T {
  if (!translation || Object.keys(translation).length === 0) return values;
  const copy = structuredClone(values);
  for (const text of settingsTexts(values, config)) {
    const value = translation[text.key];
    if (typeof value === "string") setAt(copy, text.key, value);
  }
  return copy;
}

/** Short fingerprint of a source text (FNV-1a), to notice when it changes after translation. */
export function textFingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * The translated texts after an edit in the translation editor: `edited` is the page as the
 * owner left it (same structure as the source). A text is kept when it was translated before, or
 * when it now differs from the default language; texts of removed sections are dropped.
 */
export function collectTranslation(
  sourceTexts: TranslatableText[],
  editedTexts: TranslatableText[],
  previous: Pick<PageTranslation, "values" | "sources"> | undefined,
): { values: Record<string, string>; sources: Record<string, string> } {
  const edited = new Map(editedTexts.map((text) => [text.key, text.value]));
  const values: Record<string, string> = {};
  const sources: Record<string, string> = {};
  for (const text of sourceTexts) {
    const before = previous?.values?.[text.key];
    const now = edited.get(text.key) ?? before;
    if (now === undefined) continue;
    if (before === undefined && now === text.value) continue;
    values[text.key] = now;
    // A changed translation matches today's source; an untouched one keeps its fingerprint.
    sources[text.key] =
      now !== before || !previous?.sources?.[text.key]
        ? textFingerprint(text.value)
        : (previous.sources[text.key] as string);
  }
  return { values, sources };
}

export interface TranslationStatus {
  total: number;
  translated: number;
  /** Translated, but the default language's text changed since. */
  outdated: number;
  /** `done` when every text is translated and up to date. */
  state: "todo" | "partial" | "outdated" | "done";
}

export function translationStatus(
  sourceTexts: TranslatableText[],
  translation: Pick<PageTranslation, "values" | "sources"> | undefined,
): TranslationStatus {
  let translated = 0;
  let outdated = 0;
  for (const text of sourceTexts) {
    if (typeof translation?.values?.[text.key] !== "string") continue;
    translated++;
    const source = translation.sources?.[text.key];
    if (source && source !== textFingerprint(text.value)) outdated++;
  }
  const total = sourceTexts.length;
  const state =
    translated === 0 && total > 0
      ? "todo"
      : outdated > 0
        ? "outdated"
        : translated < total
          ? "partial"
          : "done";
  return { total, translated, outdated, state };
}

/** The address of a page in a language: `/en/` for the home page, `/en/about/`. */
export function localizedSlug(slug: string, locale: string): string {
  return slug ? `${locale}/${slug}` : locale;
}
