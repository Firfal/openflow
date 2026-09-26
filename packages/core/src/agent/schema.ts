import type { ComponentConfig, Field, Fields } from "@puckeditor/core";
import type { OpenFlowConfig, SiteDefaults, ThemeConfig } from "../config.js";
import { getOpenFlowFieldKind, imageField, linkField, videoField } from "../fields.js";

/**
 * Serializable description of a site (sections, fields, settings, theme), without React code.
 * Written to Firestore by `openflow deploy` / `openflow seed` (`of_system/schema`), it lets the
 * MCP server (Cloud Functions) describe the site to an AI and validate its changes.
 */
export const SITE_SCHEMA_VERSION = 1;

export type FieldSchemaType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "select"
  | "radio"
  | "array"
  | "object"
  | "image"
  | "video"
  | "link"
  | "slot"
  | "other";

export interface FieldSchema {
  type: FieldSchemaType;
  label?: string;
  /** Choices of a `select` / `radio` field. */
  options?: Array<{ label: string; value: string | number | boolean | null }>;
  /** Fields of each list item (`array`) or of a group (`object`). */
  fields?: Record<string, FieldSchema>;
  /** Default values of a new list item. */
  defaultItem?: Record<string, unknown>;
  min?: number;
  max?: number;
  /** Text editable in place on the page (`contentEditable`). */
  inline?: boolean;
  /** Metadata kept for validation (e.g. `openflowInline`, `openflowPlaceholder`). */
  metadata?: Record<string, string | number | boolean>;
}

export interface SectionSchema {
  label: string;
  category?: string;
  fields: Record<string, FieldSchema>;
  defaults: Record<string, unknown>;
}

export interface SiteSchema {
  version: typeof SITE_SCHEMA_VERSION;
  site: SiteDefaults;
  sections: Record<string, SectionSchema>;
  settings?: { fields: Record<string, FieldSchema>; defaults: Record<string, unknown> };
  theme?: ThemeConfig;
  styles: "free" | "off";
}

function plain(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function scalarMetadata(field: Field): FieldSchema["metadata"] {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(field.metadata ?? {})) {
    if (key === "openflow") continue;
    if (["string", "number", "boolean"].includes(typeof value)) out[key] = value as never;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function fieldToSchema(field: Field): FieldSchema {
  const kind = getOpenFlowFieldKind(field);
  const base = { label: field.label, metadata: scalarMetadata(field) };
  if (kind) return { type: kind, ...base };
  switch (field.type) {
    case "text":
    case "textarea":
      return { type: field.type, ...base, inline: field.contentEditable === true || undefined };
    case "richtext":
      return { type: "richtext", ...base, inline: field.contentEditable !== false || undefined };
    case "number":
      return { type: "number", ...base, min: field.min, max: field.max };
    case "select":
    case "radio":
      return {
        type: field.type,
        ...base,
        options: field.options.map((o) => ({ label: String(o.label), value: o.value as never })),
      };
    case "array":
      return {
        type: "array",
        ...base,
        fields: fieldsToSchema(field.arrayFields as Fields),
        defaultItem: plain(field.defaultItemProps) as Record<string, unknown> | undefined,
        min: field.min,
        max: field.max,
      };
    case "object":
      return { type: "object", ...base, fields: fieldsToSchema(field.objectFields as Fields) };
    case "slot":
      return { type: "slot", ...base };
    default:
      return { type: "other", ...base };
  }
}

export function fieldsToSchema(fields: Fields | undefined): Record<string, FieldSchema> {
  return Object.fromEntries(
    Object.entries((fields ?? {}) as Record<string, Field>).map(([key, field]) => [
      key,
      JSON.parse(JSON.stringify(fieldToSchema(field))) as FieldSchema,
    ]),
  );
}

/** Serializable schema of an OpenFlow config. */
export function buildSiteSchema(config: OpenFlowConfig): SiteSchema {
  const categoryOf = new Map<string, string>();
  for (const [key, category] of Object.entries(config.categories ?? {})) {
    for (const name of category?.components ?? [])
      categoryOf.set(String(name), category?.title ?? key);
  }
  const sections: Record<string, SectionSchema> = {};
  for (const [name, component] of Object.entries(config.components)) {
    const c = component as ComponentConfig<any>;
    sections[name] = {
      label: c.label ?? name,
      category: categoryOf.get(name),
      fields: fieldsToSchema(c.fields as Fields),
      defaults: (plain(c.defaultProps) as Record<string, unknown>) ?? {},
    };
  }
  return {
    version: SITE_SCHEMA_VERSION,
    site: plain(config.site) as SiteDefaults,
    sections,
    settings: config.settings
      ? {
          fields: fieldsToSchema(config.settings.fields as Fields),
          defaults: (plain(config.settings.defaultProps) as Record<string, unknown>) ?? {},
        }
      : undefined,
    theme: plain(config.theme) as ThemeConfig | undefined,
    styles: config.editor?.styles ?? "free",
  };
}

export function schemaToField(schema: FieldSchema): Field {
  const metadata = schema.metadata;
  switch (schema.type) {
    case "image":
      return {
        ...imageField({ label: schema.label }),
        metadata: { ...imageField().metadata, ...metadata },
      } as Field;
    case "video":
      return {
        ...videoField({ label: schema.label }),
        metadata: { ...videoField().metadata, ...metadata },
      } as Field;
    case "link":
      return linkField({ label: schema.label }) as Field;
    case "text":
    case "textarea":
      return { type: schema.type, label: schema.label, contentEditable: schema.inline, metadata };
    case "richtext":
      return {
        type: "richtext",
        label: schema.label,
        contentEditable: schema.inline,
        metadata,
      } as Field;
    case "number":
      return { type: "number", label: schema.label, min: schema.min, max: schema.max, metadata };
    case "select":
    case "radio":
      return {
        type: schema.type,
        label: schema.label,
        options: (schema.options ?? []) as never,
        metadata,
      };
    case "array":
      return {
        type: "array",
        label: schema.label,
        arrayFields: schemaToFields(schema.fields),
        defaultItemProps: schema.defaultItem,
        min: schema.min,
        max: schema.max,
        metadata,
      } as Field;
    case "object":
      return {
        type: "object",
        label: schema.label,
        objectFields: schemaToFields(schema.fields),
        metadata,
      } as Field;
    case "slot":
      return { type: "slot", label: schema.label } as Field;
    default:
      return {
        type: "custom",
        label: schema.label,
        render: () => null,
        metadata,
      } as unknown as Field;
  }
}

export function schemaToFields(fields: Record<string, FieldSchema> | undefined): Fields {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([key, field]) => [key, schemaToField(field)]),
  ) as Fields;
}

/**
 * An OpenFlow config rebuilt from a schema (no rendering): enough for validation, defaults and
 * the agent tools on the server side.
 */
export function configFromSchema(schema: SiteSchema): OpenFlowConfig {
  const components: Record<string, ComponentConfig<any>> = {};
  for (const [name, section] of Object.entries(schema.sections)) {
    components[name] = {
      label: section.label,
      fields: schemaToFields(section.fields),
      defaultProps: section.defaults,
      render: () => null as never,
    };
  }
  return {
    site: schema.site,
    components,
    settings: schema.settings
      ? { fields: schemaToFields(schema.settings.fields), defaultProps: schema.settings.defaults }
      : undefined,
    theme: schema.theme,
    editor: { styles: schema.styles },
  } as OpenFlowConfig;
}
