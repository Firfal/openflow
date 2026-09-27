import { getOpenFlowFieldKind } from "@openflow/core";
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
  /** `link`: a button whose label is not editable text (only its link field is known). */
  kind?: "text" | "image" | "video" | "link";
  /** Link field of the button around the clicked text (`data-of-l`), same list item. */
  link?: string;
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

/** Fields declared at a path, e.g. the `arrayFields` of `items` (list indices ignored). */
function fieldsAt(fields: Fields | undefined, path: string): Fields | undefined {
  let current = fields as Record<string, Field> | undefined;
  for (const key of path.split(".").filter(Boolean)) {
    const field = current?.[key];
    if (field?.type === "array") current = field.arrayFields as Record<string, Field>;
    else if (field?.type === "object") current = field.objectFields as Record<string, Field>;
    else return undefined;
  }
  return current as Fields | undefined;
}

/** What the owner clicked, as the right panel shows it: one element and only its fields. */
export interface FocusGroup {
  /** « Bouton principal », « Questions n° 2 », « Titre principal »… */
  title: string;
  kind: "text" | "image" | "video" | "link" | "button" | "item";
  /** The clicked field first. `label` is empty when the title already names the only field. */
  fields: Array<ResolvedField & { short: string }>;
}

const withoutPrecision = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, "");

/**
 * The element of a click: a button (its text and its link), an item of a list (all its fields),
 * or a single text, image or video.
 */
export function resolveGroup(fields: Fields | undefined, focus: Focus): FocusGroup | undefined {
  if (!focus.path) return undefined;
  const main = resolveField(fields, focus.path, focus.index);
  if (!main) return undefined;
  const kind = getOpenFlowFieldKind(main.field);
  const own = main.field.label ?? focus.path.split(".").pop() ?? focus.path;

  if (focus.index) {
    // A list item (card, question…): every field of that item, the clicked one first.
    const segments = focus.path.split(".");
    const parent = segments.slice(0, -1).join(".");
    const siblings = Object.keys(fieldsAt(fields, parent) ?? {})
      .map((key) => resolveField(fields, [parent, key].filter(Boolean).join("."), focus.index))
      .filter((r): r is ResolvedField => Boolean(r) && r?.path !== main.path);
    const title = main.label.split(" · ").slice(1).join(" · ") || main.label;
    return {
      title,
      kind: "item",
      fields: [main, ...siblings].map((r) => ({ ...r, short: r.field.label ?? r.path })),
    };
  }

  if (focus.link && focus.link !== focus.path) {
    const link = resolveField(fields, focus.link, focus.index);
    if (link) {
      return {
        title: withoutPrecision(own),
        kind: "button",
        fields: [
          { ...main, short: "Texte du bouton" },
          { ...link, short: "Lien" },
        ],
      };
    }
  }

  return {
    title: main.label,
    kind:
      focus.kind === "link" || kind === "link"
        ? "link"
        : kind === "date"
          ? "text"
          : (kind ?? "text"),
    fields: [{ ...main, short: "" }],
  };
}
