import type { Field, Fields } from "@puckeditor/core";
import { createContext, useContext } from "react";

/**
 * The element the owner clicked on the page: a section, and optionally one of its fields
 * (`path` without indices, as in `data-of`, plus the list indices from `data-of-i`).
 */
export interface Focus {
  componentId: string;
  path?: string;
  index?: string;
  kind?: "text" | "image" | "video";
  /** Set when an image or a video was tapped (not dragged): the media library opens. */
  open?: number;
}

export interface FocusStore {
  focus: Focus | null;
  setFocus: (focus: Focus | null) => void;
}

export const FocusContext = createContext<FocusStore>({ focus: null, setFocus: () => {} });

export const useFocus = () => useContext(FocusContext);

export interface ResolvedField {
  field: Field;
  /** Concrete path for Puck's `setDeep`, e.g. `items[1].answer`. */
  path: string;
  /** Human label, e.g. « Réponse · Questions n° 2 ». */
  label: string;
}

/** Resolves a marker (`items.answer` + `1`) to the field definition and its concrete path. */
export function resolveField(
  fields: Fields | undefined,
  path: string,
  index?: string,
): ResolvedField | undefined {
  const indices = (index ?? "").split(".").filter(Boolean);
  const segments = path.split(".");
  let current = fields as Record<string, Field> | undefined;
  const concrete: string[] = [];
  const context: string[] = [];
  for (let n = 0; n < segments.length; n++) {
    const key = segments[n] as string;
    const field = current?.[key];
    if (!field) return undefined;
    if (n === segments.length - 1) {
      const leaf = concrete.length ? `${concrete.join(".")}.${key}` : key;
      const label = [field.label ?? key, ...context.reverse()].join(" · ");
      return { field, path: leaf, label };
    }
    if (field.type === "array") {
      const i = indices.shift();
      if (i === undefined) return undefined;
      concrete.push(`${key}[${i}]`);
      context.push(`${field.label ?? key} n° ${Number(i) + 1}`);
      current = field.arrayFields as Record<string, Field>;
    } else if (field.type === "object") {
      concrete.push(key);
      context.push(field.label ?? key);
      current = field.objectFields as Record<string, Field>;
    } else {
      return undefined;
    }
  }
  return undefined;
}

/** Reads `items[1].answer` from an object. */
export function getDeep(value: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], value);
}
