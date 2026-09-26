import type { ComponentConfig, Config, Field, Fields } from "@puckeditor/core";
import { createElement, isValidElement, type ReactNode } from "react";
import { getOpenFlowFieldKind, type ImageValue } from "./fields.js";

/**
 * Element markers. Every editable value of a section is wrapped (texts) or tagged (images) with
 * `data-of="<path>"` (+ `data-of-i` for list items), and every section with `data-of-s="<id>"`,
 * both in the editor and on the published site. The admin uses them to know which field was
 * clicked; style rules (`_style`) target them in the same way everywhere.
 *
 * Only values that the OpenFlow Standard already requires to be rendered as element children
 * (contentEditable texts, OF-108) are wrapped, so components keep working unchanged.
 */

/** Marker carried by a cloned image value, turned into attributes by `imageProps`. */
export const MARK_KEY = "__of";

export interface Mark {
  /** Field path without indices, e.g. `items.answer`. */
  p: string;
  /** Indices of the enclosing list items, e.g. `1` or `1.0`. */
  i?: string;
  /** Set on the editor placeholder of an empty video (rendered with its poster only). */
  e?: 1;
}

export type ImageMarked = ImageValue & { [MARK_KEY]?: Mark };

type MarkKind = "text" | "richtext" | "image" | "video";

/** Shown in the editor for an empty image field, so the owner can click it to add an image. */
export const IMAGE_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750"><rect width="1200" height="750" fill="#eef2ff"/><rect x="12" y="12" width="1176" height="726" rx="18" fill="none" stroke="#3b5bdb" stroke-width="4" stroke-dasharray="18 14"/><g fill="none" stroke="#3b5bdb" stroke-width="10" stroke-linejoin="round"><rect x="530" y="270" width="140" height="110" rx="12"/><path d="M548 362l38-40 30 28 22-18 32 30"/></g><circle cx="630" cy="302" r="10" fill="#3b5bdb"/><text x="600" y="450" text-anchor="middle" font-family="system-ui, sans-serif" font-size="42" font-weight="600" fill="#33406b">Ajouter une image</text></svg>`,
)}`;

/** Poster of the editor placeholder for an empty video field. */
export const VIDEO_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#eef2ff"/><rect x="12" y="12" width="1256" height="696" rx="18" fill="none" stroke="#3b5bdb" stroke-width="4" stroke-dasharray="18 14"/><circle cx="640" cy="320" r="70" fill="none" stroke="#3b5bdb" stroke-width="10"/><path d="M620 285v70l58-35z" fill="#3b5bdb"/><text x="640" y="470" text-anchor="middle" font-family="system-ui, sans-serif" font-size="42" font-weight="600" fill="#33406b">Ajouter une vidéo</text></svg>`,
)}`;

/** Editable paths of a component, e.g. `title`, `items.answer`, `image` (for tooling). */
export function collectEditablePaths(
  fields: Fields | undefined,
  prefix = "",
): Array<{ path: string; kind: MarkKind }> {
  const out: Array<{ path: string; kind: MarkKind }> = [];
  for (const [key, field] of Object.entries((fields ?? {}) as Record<string, Field>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const kind = markKind(field);
    if (kind) out.push({ path, kind });
    else if (field.type === "array")
      out.push(...collectEditablePaths(field.arrayFields as Fields, path));
    else if (field.type === "object")
      out.push(...collectEditablePaths(field.objectFields as Fields, path));
  }
  return out;
}

function markKind(field: Field): MarkKind | undefined {
  const openflow = getOpenFlowFieldKind(field);
  if (openflow === "image" || openflow === "video") return openflow;
  if (field.metadata?.openflowInline === false) return undefined;
  if (field.type === "richtext") return field.contentEditable === false ? undefined : "richtext";
  if ((field.type === "text" || field.type === "textarea") && field.contentEditable === true)
    return "text";
  return undefined;
}

interface MarkOptions {
  /** Inside the admin editor: empty images get a clickable placeholder. */
  editing?: boolean;
}

function markValue(
  field: Field,
  value: unknown,
  path: string,
  index: string[],
  options: MarkOptions,
): unknown {
  const kind = markKind(field);
  const i = index.length > 0 ? index.join(".") : undefined;
  if (kind === "image" || kind === "video") {
    const mark = { p: path, i } satisfies Mark;
    const empty = !value || typeof value !== "object" || !(value as { src?: string }).src;
    if (empty) {
      if (!options.editing || field.metadata?.openflowPlaceholder === false) return value;
      return kind === "image"
        ? { src: IMAGE_PLACEHOLDER, alt: "", width: 1200, height: 750, [MARK_KEY]: mark }
        : { src: "", poster: VIDEO_PLACEHOLDER, [MARK_KEY]: { ...mark, e: 1 } };
    }
    return { ...(value as object), [MARK_KEY]: mark };
  }
  if (kind === "text" || kind === "richtext") {
    // Empty values stay empty so `{intro && <p>{intro}</p>}` keeps working on the published site.
    const filled = typeof value === "string" ? value.length > 0 : isValidElement(value);
    if (!filled) return value;
    return createElement(
      kind === "richtext" ? "div" : "span",
      {
        "data-of": path,
        "data-of-i": i,
        style: kind === "richtext" ? { display: "contents" } : undefined,
      },
      value as ReactNode,
    );
  }
  if (field.type === "array" && Array.isArray(value)) {
    return value.map((item, n) =>
      item && typeof item === "object"
        ? markFields(
            field.arrayFields as Fields,
            item as Record<string, unknown>,
            path,
            [...index, String(n)],
            options,
          )
        : item,
    );
  }
  if (field.type === "object" && value && typeof value === "object") {
    return markFields(
      field.objectFields as Fields,
      value as Record<string, unknown>,
      path,
      index,
      options,
    );
  }
  return value;
}

function markFields(
  fields: Fields | undefined,
  values: Record<string, unknown>,
  prefix: string,
  index: string[],
  options: MarkOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const [key, field] of Object.entries((fields ?? {}) as Record<string, Field>)) {
    if (!(key in values)) continue;
    out[key] = markValue(field, values[key], prefix ? `${prefix}.${key}` : key, index, options);
  }
  return out;
}

/** Returns a copy of `props` with editable values marked (the input is never mutated). */
export function markProps(
  fields: Fields | undefined,
  props: Record<string, unknown>,
  options: MarkOptions = {},
): Record<string, unknown> {
  return markFields(fields, props, "", [], options);
}

/** Wraps a component's `render`: marked props, and the section wrapped in `data-of-s`. */
export function markComponent<C extends ComponentConfig<any>>(component: C): C {
  const render = component.render as (props: any) => ReactNode;
  function MarkedSection(props: Record<string, unknown>) {
    const editing = (props.puck as { isEditing?: boolean } | undefined)?.isEditing === true;
    const marked = markProps(component.fields as Fields, props, { editing });
    return createElement(
      "div",
      { "data-of-s": props.id as string, style: { display: "contents" } },
      createElement(render, marked),
    );
  }
  return { ...component, render: MarkedSection } as C;
}

/** Puck config used to render published pages (and by the checker): every component marked. */
export function prepareRenderConfig<T extends Pick<Config, "components">>(config: T): T {
  const components = Object.fromEntries(
    Object.entries(config.components).map(([name, component]) => [
      name,
      markComponent(component as ComponentConfig<any>),
    ]),
  );
  return { ...config, components };
}
