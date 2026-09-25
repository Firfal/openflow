import type { ComponentData, Data } from "@puckeditor/core";
import type { LinkValue } from "./fields.js";

type Item = { type: string; props: Record<string, unknown> };

function isItem(value: unknown): value is Item {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Item).type === "string" &&
    typeof (value as Item).props === "object" &&
    (value as Item).props !== null
  );
}

function isItemArray(value: unknown): value is Item[] {
  return Array.isArray(value) && value.length > 0 && value.every(isItem);
}

/**
 * Visits every component of a page, including components nested in slots and legacy zones.
 * The callback receives the component and its path (e.g. `content[2].props.items[0]`).
 */
export function walkComponents(data: Data, visit: (item: ComponentData, path: string) => void) {
  const visitList = (items: unknown, path: string) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => {
      if (!isItem(item)) return;
      const itemPath = `${path}[${index}]`;
      visit(item as ComponentData, itemPath);
      for (const [key, value] of Object.entries(item.props)) {
        if (isItemArray(value)) visitList(value, `${itemPath}.props.${key}`);
      }
    });
  };
  visitList(data.content, "content");
  for (const [zone, items] of Object.entries(data.zones ?? {})) visitList(items, `zones.${zone}`);
}

/** Returns a deep copy of the page data where every component has a stable `props.id`. */
export function ensureIds(data: Data): Data {
  const copy = structuredClone(data) as Data;
  const used = new Set<string>();
  const missing: ComponentData[] = [];
  // First pass reserves existing ids so generated ones never collide with later components.
  walkComponents(copy, (item) => {
    const current = item.props.id;
    if (typeof current === "string" && current && !used.has(current)) used.add(current);
    else missing.push(item);
  });
  for (const item of missing) {
    let n = 1;
    let candidate = `${item.type}-${n}`;
    while (used.has(candidate)) candidate = `${item.type}-${++n}`;
    used.add(candidate);
    (item.props as Record<string, unknown>).id = candidate;
  }
  copy.root ??= { props: {} };
  copy.content ??= [];
  return copy;
}

function isPageLink(value: unknown): value is Extract<LinkValue, { kind: "page" }> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as LinkValue).kind === "page" &&
    typeof (value as { pageId?: unknown }).pageId === "string"
  );
}

/** Recursively rewrites `href` of internal page links from the current slugs. */
export function resolvePageLinks<T>(value: T, hrefByPageId: Map<string, string>): T {
  if (Array.isArray(value)) {
    return value.map((entry) => resolvePageLinks(entry, hrefByPageId)) as T;
  }
  if (typeof value !== "object" || value === null) return value;
  if (isPageLink(value)) {
    const href = hrefByPageId.get(value.pageId);
    return { ...value, href: href ?? value.href } as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value))
    out[key] = resolvePageLinks(entry, hrefByPageId);
  return out as T;
}

/** Approximate serialized size in bytes (used to warn before the 1 MiB Firestore limit). */
export function estimateSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
