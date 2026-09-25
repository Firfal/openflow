import type { ComponentData, Data, Field, Fields } from "@puckeditor/core";
import type { OpenFlowConfig } from "./config.js";
import { getOpenFlowFieldKind } from "./fields.js";
import { walkComponents } from "./walk.js";

export type Severity = "error" | "warning";

/** A problem found by OpenFlow validation. `rule` refers to the OpenFlow Standard (OF-xxx). */
export interface Issue {
  rule: string;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  /** Short, actionable fix written for an AI coding agent. */
  hint?: string;
}

const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*$/;

function fieldEntries(fields: Fields | undefined): Array<[string, Field]> {
  return Object.entries((fields ?? {}) as Record<string, Field>);
}

/** Checks the static shape of the config: component names, defaults (OF-203, OF-105). */
export function validateConfig(config: OpenFlowConfig, file = "openflow.config.tsx"): Issue[] {
  const issues: Issue[] = [];
  if (!config.site?.name) {
    issues.push({
      rule: "OF-203",
      severity: "error",
      message: "`site.name` est obligatoire dans defineConfig().",
      file,
      hint: 'Ajoutez `site: { name: "Nom du site", lang: "fr" }` à defineConfig().',
    });
  }
  const names = Object.keys(config.components ?? {});
  if (names.length === 0) {
    issues.push({
      rule: "OF-203",
      severity: "error",
      message: "La config ne déclare aucune section (`components` est vide).",
      file,
      hint: "Déclarez au moins une section dans `components`.",
    });
  }
  for (const name of names) {
    if (!COMPONENT_NAME.test(name)) {
      issues.push({
        rule: "OF-203",
        severity: "error",
        message: `Nom de section invalide « ${name} » : PascalCase attendu (ex. « HeroBanner »).`,
        file,
        hint: "Renommez la clé dans `components` en PascalCase ; ne renommez jamais une section déjà en production sans migration.",
      });
    }
    const component = config.components[name]!;
    issues.push(
      ...checkDefaults(component.fields, component.defaultProps, `section ${name}`, file),
    );
  }
  for (const [category, entry] of Object.entries(config.categories ?? {})) {
    for (const component of entry?.components ?? []) {
      if (!names.includes(String(component))) {
        issues.push({
          rule: "OF-203",
          severity: "error",
          message: `La catégorie « ${category} » référence une section inconnue « ${String(component)} ».`,
          file,
        });
      }
    }
  }
  if (config.settings) {
    issues.push(
      ...checkDefaults(
        config.settings.fields as Fields,
        config.settings.defaultProps as Record<string, unknown>,
        "réglages",
        file,
      ),
    );
  }
  return issues;
}

function checkDefaults(
  fields: Fields | undefined,
  defaults: Record<string, unknown> | undefined,
  where: string,
  file: string,
): Issue[] {
  const issues: Issue[] = [];
  for (const [key, field] of fieldEntries(fields)) {
    if (field.type === "slot") continue;
    if (defaults?.[key] === undefined) {
      issues.push({
        rule: "OF-105",
        severity: "error",
        message: `Le champ « ${key} » (${where}) n'a pas de valeur par défaut.`,
        file,
        hint: `Ajoutez \`${key}\` dans \`defaultProps\` avec un contenu d'exemple réaliste (une image peut valoir \`null\`).`,
      });
    }
    if (field.type === "array" && field.defaultItemProps === undefined) {
      issues.push({
        rule: "OF-105",
        severity: "warning",
        message: `La liste « ${key} » (${where}) n'a pas de \`defaultItemProps\` : les nouveaux éléments seront vides.`,
        file,
        hint: `Ajoutez \`defaultItemProps\` au champ \`${key}\`.`,
      });
    }
  }
  return issues;
}

/** Merges each component's `defaultProps` under its stored props (Render does not do it). */
export function applyDefaults(data: Data, config: OpenFlowConfig): Data {
  const copy = structuredClone(data) as Data;
  walkComponents(copy, (item) => {
    const defaults = config.components[item.type]?.defaultProps;
    if (defaults) {
      (item as { props: Record<string, unknown> }).props = { ...defaults, ...item.props };
    }
  });
  return copy;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkValue(field: Field, value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  const kind = getOpenFlowFieldKind(field);
  if (kind === "image") {
    if (value === null) return undefined;
    if (!isObject(value) || typeof value.src !== "string" || typeof value.alt !== "string") {
      return `${path} : image attendue sous la forme { "src": "...", "alt": "..." } ou null`;
    }
    return undefined;
  }
  if (kind === "link") {
    if (value === null) return undefined;
    if (!isObject(value) || typeof value.href !== "string") {
      return `${path} : lien attendu sous la forme { "kind": "page", "pageId": "...", "href": "/..." } ou { "kind": "url", "href": "https://..." }`;
    }
    if (value.kind === "page" && typeof value.pageId !== "string") {
      return `${path} : un lien interne doit préciser "pageId"`;
    }
    if (value.kind !== "page" && value.kind !== "url")
      return `${path} : "kind" doit valoir "page" ou "url"`;
    return undefined;
  }
  switch (field.type) {
    case "text":
    case "textarea":
    case "richtext":
      return typeof value === "string" ? undefined : `${path} : texte attendu`;
    case "number":
      return typeof value === "number" ? undefined : `${path} : nombre attendu`;
    case "select":
    case "radio":
      return field.options.some((option) => option.value === value)
        ? undefined
        : `${path} : valeur « ${String(value)} » hors des options autorisées`;
    case "array": {
      if (!Array.isArray(value)) return `${path} : liste attendue`;
      for (const [index, item] of value.entries()) {
        if (!isObject(item)) return `${path}[${index}] : objet attendu`;
        for (const [key, sub] of fieldEntries(field.arrayFields as Fields)) {
          const problem = checkValue(sub, item[key], `${path}[${index}].${key}`);
          if (problem) return problem;
        }
      }
      return undefined;
    }
    case "object": {
      if (!isObject(value)) return `${path} : objet attendu`;
      for (const [key, sub] of fieldEntries(field.objectFields as Fields)) {
        const problem = checkValue(sub, value[key], `${path}.${key}`);
        if (problem) return problem;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/** Validates page data against the config (OF-201): known sections, props matching fields. */
export function validatePageData(data: Data, config: OpenFlowConfig, file?: string): Issue[] {
  const issues: Issue[] = [];
  walkComponents(data, (item: ComponentData, path) => {
    const component = config.components[item.type];
    if (!component) {
      issues.push({
        rule: "OF-201",
        severity: "error",
        message: `${path} : section inconnue « ${item.type} ».`,
        file,
        hint: `Utilisez une section déclarée dans openflow.config.tsx (${Object.keys(config.components).join(", ")}).`,
      });
      return;
    }
    const fields = (component.fields ?? {}) as Record<string, Field>;
    for (const [key, value] of Object.entries(item.props)) {
      if (key === "id") continue;
      const field = fields[key];
      if (!field) {
        issues.push({
          rule: "OF-201",
          severity: "warning",
          message: `${path}.props.${key} : propriété absente des champs de « ${item.type} ».`,
          file,
          hint: "Supprimez la propriété ou déclarez le champ correspondant.",
        });
        continue;
      }
      if (field.type === "slot") continue;
      const problem = checkValue(field, value, `${path}.props.${key}`);
      if (problem) {
        issues.push({ rule: "OF-201", severity: "error", message: problem, file });
      }
    }
  });
  return issues;
}

/** Validates global settings values against `config.settings.fields` (OF-201). */
export function validateSettingsValues(
  values: Record<string, unknown>,
  config: OpenFlowConfig,
  file?: string,
): Issue[] {
  const issues: Issue[] = [];
  const fields = (config.settings?.fields ?? {}) as Record<string, Field>;
  for (const [key, value] of Object.entries(values)) {
    const field = fields[key];
    if (!field) {
      issues.push({
        rule: "OF-201",
        severity: "warning",
        message: `settings.${key} : réglage absent de \`settings.fields\`.`,
        file,
      });
      continue;
    }
    const problem = checkValue(field, value, `settings.${key}`);
    if (problem) issues.push({ rule: "OF-201", severity: "error", message: problem, file });
  }
  return issues;
}
