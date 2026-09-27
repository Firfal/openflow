import type { Data, Field, Fields } from "@puckeditor/core";
import { businessLines } from "./business.js";
import { buildCollections } from "./collections.js";
import type { OpenFlowConfig } from "./config.js";
import {
  formatDate,
  getOpenFlowFieldKind,
  type ImageValue,
  isValidDate,
  type VideoValue,
} from "./fields.js";
import { slugToPath } from "./slug.js";
import type { Snapshot } from "./snapshot.js";
import { applyDefaults } from "./validate.js";
import { walkComponents } from "./walk.js";

/**
 * The published site as AI agents read it (https://llmstxt.org): `llms.txt` lists the pages,
 * `llms-full.txt` gives their text in Markdown. Built from the snapshot, like the pages themselves,
 * so nothing unpublished leaks; pages marked `noindex` are left out, as in the sitemap.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
};

/** Rich text (the sanitized HTML of `richtext` fields) as simple Markdown. */
export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(strong|b)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<h([1-6])(?:\s[^>]*)?>/gi, "\n\n### ")
    .replace(/<li(?:\s[^>]*)?>/gi, "\n- ")
    .replace(/<\/(p|h[1-6]|ul|ol|blockquote|div)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name: string) => ENTITIES[name] ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Text of one field value: texts, rich texts, lists and groups, image and video descriptions. */
function fieldText(field: Field, value: unknown, out: string[], lang = "fr"): void {
  if (value === null || value === undefined || value === "") return;
  const kind = getOpenFlowFieldKind(field);
  if (kind === "image") {
    const alt = (value as ImageValue).alt?.trim();
    if (alt) out.push(`[Image : ${alt}]`);
    return;
  }
  if (kind === "video") {
    const description = (value as VideoValue).description?.trim();
    if (description) out.push(`[Vidéo : ${description}]`);
    return;
  }
  if (kind === "link") return;
  if (kind === "date") {
    if (isValidDate(value)) out.push(`Date : ${formatDate(value, lang)}`);
    return;
  }
  switch (field.type) {
    case "text":
    case "textarea":
      if (typeof value === "string" && value.trim()) out.push(value.trim());
      return;
    case "richtext": {
      const markdown = typeof value === "string" ? htmlToMarkdown(value) : "";
      if (markdown) out.push(markdown);
      return;
    }
    case "array":
      if (!Array.isArray(value)) return;
      for (const item of value) {
        const parts: string[] = [];
        for (const [key, sub] of Object.entries(field.arrayFields ?? {})) {
          fieldText(sub as Field, (item as Record<string, unknown>)?.[key], parts, lang);
        }
        // The first text of an item is its title (« question », « nom »…), unless it is a media.
        if (parts.length === 1 || parts[0]?.startsWith("[")) {
          if (parts.length > 0) out.push(`- ${parts.join(" ")}`);
        } else if (parts.length > 1) {
          out.push(`- **${parts[0]}** : ${parts.slice(1).join(" ")}`);
        }
      }
      return;
    case "object":
      for (const [key, sub] of Object.entries(field.objectFields ?? {})) {
        fieldText(sub as Field, (value as Record<string, unknown>)[key], out, lang);
      }
      return;
    default:
      // Choices, numbers, slots (their sections are visited on their own), custom fields.
      return;
  }
}

/** The text of a page, section after section, in Markdown. */
export function pageText(data: Data, config: OpenFlowConfig, lang = "fr"): string {
  const sections: string[] = [];
  walkComponents(applyDefaults(data, config), (item) => {
    const fields = config.components[item.type]?.fields as Fields | undefined;
    if (!fields) return;
    const out: string[] = [];
    for (const [key, field] of Object.entries(fields)) {
      if (!key.startsWith("_")) fieldText(field as Field, item.props[key], out, lang);
    }
    if (out.length > 0) sections.push(out.join("\n\n"));
  });
  // Consecutive list items read as one list.
  return sections.join("\n\n").replace(/^(- .*)\n\n(?=- )/gm, "$1\n");
}

function pageAddress(site: Snapshot["site"], slug: string): string {
  const path = slugToPath(slug);
  if (!site.url) return path;
  return new URL(path, site.url.endsWith("/") ? site.url : `${site.url}/`).toString();
}

const indexed = (snapshot: Snapshot) => snapshot.pages.filter((page) => !page.seo.noindex);
const line = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * `llms.txt`: the site, its description and the list of its pages; with the config, the items of
 * each collection come under their own heading (newest first), with their date and summary.
 */
export function buildLlmsTxt(snapshot: Snapshot, config?: OpenFlowConfig): string {
  const { site } = snapshot;
  const lines = [`# ${line(site.name)}`, ""];
  if (site.description) lines.push(`> ${line(site.description)}`, "");
  const practical = businessLines(site, snapshot.createdAt.slice(0, 10));
  if (practical.length > 0) lines.push("## Informations pratiques", "", ...practical, "");
  const known = new Set(Object.keys(config?.collections ?? {}));
  const pages = indexed(snapshot).filter((page) => !page.collection || !known.has(page.collection));
  lines.push("## Pages", "");
  for (const page of pages) {
    const description = page.seo.description ? `: ${line(page.seo.description)}` : "";
    lines.push(
      `- [${line(page.seo.title || page.title)}](${pageAddress(site, page.slug)})${description}`,
    );
  }
  if (config) {
    const hidden = new Set(snapshot.pages.filter((p) => p.seo.noindex).map((p) => p.id));
    const collections = buildCollections(snapshot.pages, config);
    for (const [name, entries] of Object.entries(collections)) {
      const visible = entries.filter((entry) => !hidden.has(entry.id));
      if (visible.length === 0) continue;
      lines.push("", `## ${line(config.collections?.[name]?.label ?? name)}`, "");
      for (const entry of visible) {
        const date = entry.date ? ` (${formatDate(entry.date, site.lang)})` : "";
        const description = entry.description ? `: ${line(entry.description)}` : "";
        lines.push(
          `- [${line(entry.title)}](${pageAddress(site, entry.slug)})${date}${description}`,
        );
      }
    }
  }
  lines.push(
    "",
    "## Optional",
    "",
    `- [Texte complet du site](${site.url ? new URL("/llms-full.txt", site.url).toString() : "/llms-full.txt"}): toutes les pages en Markdown`,
    "",
  );
  return lines.join("\n");
}

/** `llms-full.txt`: every page with its address, description and text. */
export function buildLlmsFullTxt(snapshot: Snapshot, config: OpenFlowConfig): string {
  const { site } = snapshot;
  const header = [`# ${line(site.name)}`];
  if (site.description) header.push(`> ${line(site.description)}`);
  const practical = businessLines(site, snapshot.createdAt.slice(0, 10));
  if (practical.length > 0) header.push(`## Informations pratiques\n\n${practical.join("\n")}`);
  const parts = [header.join("\n\n")];
  for (const page of indexed(snapshot)) {
    const head = [
      `## ${line(page.seo.title || page.title)}`,
      "",
      `URL : ${pageAddress(site, page.slug)}`,
    ];
    if (page.seo.description) head.push("", `> ${line(page.seo.description)}`);
    const text = pageText(page.data, config, site.lang);
    parts.push(text ? `${head.join("\n")}\n\n${text}` : head.join("\n"));
  }
  return `${parts.join("\n\n---\n\n")}\n`;
}
