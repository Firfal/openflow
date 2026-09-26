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
}

export type ImageMarked = ImageValue & { [MARK_KEY]?: Mark };

/** Editable paths of a component, e.g. `title`, `items.answer`, `image` (for tooling). */
export function collectEditablePaths(
  fields: Fields | undefined,
  prefix = "",
): Array<{ path: string; kind: "text" | "richtext" | "image" }> {
  const out: Array<{ path: string; kind: "text" | "richtext" | "image" }> = [];
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

function markKind(field: Field): "text" | "richtext" | "image" | undefined {
  if (getOpenFlowFieldKind(field) === "image") return "image";
  if (field.metadata?.openflowInline === false) return undefined;
  if (field.type === "richtext") return field.contentEditable === false ? undefined : "richtext";
  if ((field.type === "text" || field.type === "textarea") && field.contentEditable === true)
    return "text";
  return undefined;
}

function markValue(field: Field, value: unknown, path: string, index: string[]): unknown {
  const kind = markKind(field);
  const i = index.length > 0 ? index.join(".") : undefined;
  if (kind === "image") {
    if (!value || typeof value !== "object") return value;
    return { ...(value as object), [MARK_KEY]: { p: path, i } satisfies Mark };
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
        ? markFields(field.arrayFields as Fields, item as Record<string, unknown>, path, [
            ...index,
            String(n),
          ])
        : item,
    );
  }
  if (field.type === "object" && value && typeof value === "object") {
    return markFields(field.objectFields as Fields, value as Record<string, unknown>, path, index);
  }
  return value;
}

function markFields(
  fields: Fields | undefined,
  values: Record<string, unknown>,
  prefix: string,
  index: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const [key, field] of Object.entries((fields ?? {}) as Record<string, Field>)) {
    if (!(key in values)) continue;
    out[key] = markValue(field, values[key], prefix ? `${prefix}.${key}` : key, index);
  }
  return out;
}

/** Returns a copy of `props` with editable values marked (the input is never mutated). */
export function markProps(
  fields: Fields | undefined,
  props: Record<string, unknown>,
): Record<string, unknown> {
  return markFields(fields, props, "", []);
}

/** Wraps a component's `render`: marked props, and the section wrapped in `data-of-s`. */
export function markComponent<C extends ComponentConfig<any>>(component: C): C {
  const render = component.render as (props: any) => ReactNode;
  function MarkedSection(props: Record<string, unknown>) {
    const marked = markProps(component.fields as Fields, props);
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
