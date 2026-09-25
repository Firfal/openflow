import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  getOpenFlowFieldKind,
  type Issue,
  type OpenFlowConfig,
  validateConfig,
  validatePageData,
  validateSettingsValues,
} from "@openflow/core";
import { configFile, loadSeed } from "@openflow/core/node";
import type { Field } from "@puckeditor/core";
import { createJiti } from "jiti";
import { type DefaultTreeAdapterMap, parse } from "parse5";
import { getRule } from "./rules.js";

type Element = DefaultTreeAdapterMap["element"];
type ChildNode = DefaultTreeAdapterMap["childNode"];

export interface LoadedSite {
  config: OpenFlowConfig;
  renderToStaticMarkup: (element: unknown) => string;
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown;
  Render: unknown;
}

/**
 * Loads `openflow.config.tsx` outside of Next.js, with the site's own React and Puck, and small
 * shims for `next/link`, `next/image` and `next/navigation`.
 */
export async function loadSite(siteDir: string): Promise<LoadedSite> {
  const file = configFile(siteDir);
  if (!file) throw new Error("openflow.config.tsx introuvable");
  const options = {
    jsx: { runtime: "automatic" as const },
    tsconfigPaths: true,
    moduleCache: false,
    fsCache: false,
    interopDefault: true,
  };
  const base = createJiti(file, options);
  const React = (await base.import("react")) as any;
  const server = (await base.import("react-dom/server")) as any;
  const puck = (await base.import("@puckeditor/core")) as any;
  const h = React.createElement;
  const Link = ({ href, children, prefetch: _p, replace: _r, scroll: _s, ...rest }: any) =>
    h("a", { href: typeof href === "string" ? href : (href?.pathname ?? "#"), ...rest }, children);
  const Image = ({
    src,
    fill: _f,
    priority: _p,
    placeholder: _ph,
    blurDataURL: _b,
    loader: _l,
    quality: _q,
    unoptimized: _u,
    ...rest
  }: any) => h("img", { src: typeof src === "string" ? src : src?.src, ...rest });
  const navigation = {
    usePathname: () => "/",
    useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
    notFound: () => {
      throw new Error("notFound()");
    },
    redirect: () => {
      throw new Error("redirect()");
    },
  };
  const jiti = createJiti(file, {
    ...options,
    virtualModules: {
      "next/link": { __esModule: true, default: Link },
      "next/image": { __esModule: true, default: Image },
      "next/navigation": { __esModule: true, ...navigation },
    },
  });
  const mod = (await jiti.import(file)) as any;
  const config = (mod?.default ?? mod) as OpenFlowConfig;
  if (!config || typeof config !== "object" || !config.components) {
    throw new Error("openflow.config.tsx doit exporter par défaut le résultat de defineConfig()");
  }
  return {
    config,
    renderToStaticMarkup: server.renderToStaticMarkup,
    createElement: h,
    Render: puck.Render,
  };
}

interface SentinelInfo {
  path: string;
  fieldType: string;
  contentEditable: boolean;
  /** `false` for optional tokens (e.g. image alt). */
  required: boolean;
  /** Field explicitly kept out of inline editing (`metadata: { openflowInline: false }`). */
  inlineOptOut?: boolean;
}

class Sentinels {
  private n = 0;
  readonly byToken = new Map<string, SentinelInfo>();
  next(info: SentinelInfo): string {
    const token = `OFS${++this.n}Z`;
    this.byToken.set(token, info);
    return token;
  }
}

const TOKEN = /OFS\d+Z/g;
const SENTINEL_HOST = "https://sentinel.openflow.invalid";

function fieldsOf(value: unknown): Array<[string, Field]> {
  return Object.entries((value ?? {}) as Record<string, Field>);
}

function sentinelValue(
  field: Field,
  fieldPath: string,
  sentinels: Sentinels,
  fallback: unknown,
): unknown {
  const kind = getOpenFlowFieldKind(field);
  if (kind === "image") {
    const src = sentinels.next({
      path: `${fieldPath}.src`,
      fieldType: "image",
      contentEditable: false,
      required: true,
    });
    const alt = sentinels.next({
      path: `${fieldPath}.alt`,
      fieldType: "image",
      contentEditable: false,
      required: false,
    });
    return { src: `${SENTINEL_HOST}/${src}.jpg`, alt };
  }
  if (kind === "link") {
    const href = sentinels.next({
      path: fieldPath,
      fieldType: "link",
      contentEditable: false,
      required: true,
    });
    return { kind: "url", href: `${SENTINEL_HOST}/${href}` };
  }
  const editable = "contentEditable" in field && field.contentEditable === true;
  const inlineOptOut = field.metadata?.openflowInline === false;
  switch (field.type) {
    case "text":
    case "textarea":
      return sentinels.next({
        path: fieldPath,
        fieldType: field.type,
        contentEditable: editable,
        required: true,
        inlineOptOut,
      });
    case "richtext":
      return `<p>${sentinels.next({ path: fieldPath, fieldType: "richtext", contentEditable: true, required: true })}</p>`;
    case "array": {
      const base =
        typeof field.defaultItemProps === "function"
          ? field.defaultItemProps(0)
          : (field.defaultItemProps ?? (Array.isArray(fallback) ? fallback[0] : undefined) ?? {});
      const item: Record<string, unknown> = { ...(base as object) };
      for (const [key, sub] of fieldsOf(field.arrayFields)) {
        item[key] = sentinelValue(sub, `${fieldPath}[0].${key}`, sentinels, (base as any)?.[key]);
      }
      return [item];
    }
    case "object": {
      const out: Record<string, unknown> = { ...((fallback as object) ?? {}) };
      for (const [key, sub] of fieldsOf(field.objectFields)) {
        out[key] = sentinelValue(sub, `${fieldPath}.${key}`, sentinels, (fallback as any)?.[key]);
      }
      return out;
    }
    case "slot":
      return [];
    default:
      return fallback;
  }
}

type Scenario = "vide" | "long" | "partiel";
const LONG_TEXT = `${"Texte très long pour tester la robustesse de la mise en page ".repeat(30)}fin`;

function scenarioValue(field: Field, scenario: Scenario, fallback: unknown): unknown {
  const kind = getOpenFlowFieldKind(field);
  if (kind === "image")
    return scenario === "partiel"
      ? { src: "", alt: "" }
      : scenario === "vide"
        ? null
        : { src: `${SENTINEL_HOST}/long.jpg`, alt: LONG_TEXT };
  if (kind === "link")
    return scenario === "partiel"
      ? { kind: "url", href: "" }
      : scenario === "vide"
        ? null
        : { kind: "url", href: `${SENTINEL_HOST}/long` };
  switch (field.type) {
    case "text":
    case "textarea":
      return scenario === "long" ? LONG_TEXT : scenario === "vide" ? "" : fallback;
    case "richtext":
      return scenario === "long" ? `<p>${LONG_TEXT}</p>` : scenario === "vide" ? "" : fallback;
    case "array": {
      if (scenario === "vide") return [];
      if (scenario === "partiel") return [{}];
      const base =
        typeof field.defaultItemProps === "function"
          ? field.defaultItemProps(0)
          : (field.defaultItemProps ?? {});
      return Array.from({ length: 12 }, () => {
        const item: Record<string, unknown> = { ...(base as object) };
        for (const [key, sub] of fieldsOf(field.arrayFields))
          item[key] = scenarioValue(sub, scenario, (base as any)?.[key]);
        return item;
      });
    }
    case "object": {
      const out: Record<string, unknown> = { ...((fallback as object) ?? {}) };
      for (const [key, sub] of fieldsOf(field.objectFields))
        out[key] = scenarioValue(sub, scenario, (fallback as any)?.[key]);
      return out;
    }
    case "slot":
      return [];
    default:
      return fallback;
  }
}

interface Occurrences {
  text: Set<string>;
  attribute: Set<string>;
  leftoverText: string[];
}

const SKIPPED_TEXT_PARENTS = new Set(["script", "style", "svg", "noscript", "template"]);

function collect(html: string): Occurrences {
  const result: Occurrences = { text: new Set(), attribute: new Set(), leftoverText: [] };
  const fragment = parse(`<!doctype html><html><body>${html}</body></html>`);
  const visit = (node: ChildNode | DefaultTreeAdapterMap["document"], skip: boolean) => {
    if ("attrs" in node) {
      for (const attr of (node as Element).attrs) {
        for (const token of attr.value.match(TOKEN) ?? []) result.attribute.add(token);
      }
    }
    if (node.nodeName === "#text") {
      const value = (node as DefaultTreeAdapterMap["textNode"]).value;
      for (const token of value.match(TOKEN) ?? []) result.text.add(token);
      const leftover = value.replace(TOKEN, " ").replace(/\s+/g, " ").trim();
      if (!skip && /\p{L}{2,}/u.test(leftover)) result.leftoverText.push(leftover);
    }
    if ("childNodes" in node) {
      const skipChildren = skip || SKIPPED_TEXT_PARENTS.has(node.nodeName);
      for (const child of node.childNodes as ChildNode[]) visit(child, skipChildren);
    }
  };
  visit(fragment, false);
  return result;
}

export interface SectionReport {
  name: string;
  fields: number;
  renderedFields: number;
  file?: string;
}

export interface RenderReport {
  issues: Issue[];
  sections: SectionReport[];
}

async function listSourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listSourceFiles(full)));
    else if (/\.[jt]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Best-effort mapping from a section name or a text snippet to `file:line` in `openflow/`. */
async function locate(
  siteDir: string,
  needle: RegExp,
): Promise<{ file: string; line: number } | undefined> {
  const files = [
    ...(await listSourceFiles(path.join(siteDir, "openflow"))),
    ...[configFile(siteDir)].filter((f): f is string => Boolean(f)),
  ];
  for (const file of files) {
    if (file.includes(`${path.sep}seed${path.sep}`)) continue;
    const lines = (await readFile(file, "utf8")).split("\n");
    const index = lines.findIndex((line) => needle.test(line));
    if (index !== -1) return { file: path.relative(siteDir, file), line: index + 1 };
  }
  return undefined;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeIssue(ruleId: string, message: string, where?: { file: string; line: number }): Issue {
  const rule = getRule(ruleId);
  return {
    rule: rule.id,
    severity: rule.severity,
    message,
    file: where?.file,
    line: where?.line,
    hint: rule.fix,
  };
}

/**
 * Level `render`: validates config and seed, then renders every section with sentinel values
 * (dead fields OF-104, hard-coded text OF-101, inline editing OF-106/OF-108) and with edge-case
 * values (OF-107).
 */
export async function checkRender(
  siteDir: string,
  options: { sections?: boolean } = {},
): Promise<RenderReport> {
  const issues: Issue[] = [];
  const sections: SectionReport[] = [];
  let site: LoadedSite;
  try {
    site = await loadSite(siteDir);
  } catch (error) {
    issues.push(
      makeIssue(
        "OF-107",
        `Impossible de charger openflow.config.tsx hors de Next.js : ${(error as Error).message.split("\n")[0]}`,
        { file: path.relative(siteDir, configFile(siteDir) ?? "openflow.config.tsx"), line: 1 },
      ),
    );
    return { issues, sections };
  }
  const { config } = site;
  const configRel = path.relative(siteDir, configFile(siteDir)!);
  issues.push(...validateConfig(config, configRel));

  const { seed, issues: seedIssues } = await loadSeed(siteDir, config);
  issues.push(...seedIssues);
  if (seed) {
    for (const page of seed.pages) {
      issues.push(...validatePageData(page.data, config, `openflow/seed/pages/${page.id}.json`));
    }
    issues.push(
      ...validateSettingsValues(seed.settings.values, config, "openflow/seed/settings.json"),
    );
  }

  const render = (name: string, props: Record<string, unknown>) =>
    site.renderToStaticMarkup(
      site.createElement(site.Render, {
        config: { components: { [name]: config.components[name] } },
        data: {
          root: { props: {} },
          content: [{ type: name, props: { id: `${name}-check`, ...props } }],
        },
      }),
    );

  if (options.sections === false) return { issues, sections };

  for (const [name, component] of Object.entries(config.components)) {
    const where = await locate(
      siteDir,
      new RegExp(`(\\b${name}\\b\\s*[:=]|function\\s+${name}\\b|const\\s+${name}\\b)`),
    );
    const fields = fieldsOf(component.fields).filter(([, field]) => field.visible !== false);
    const defaults = (component.defaultProps ?? {}) as Record<string, unknown>;
    const sentinels = new Sentinels();
    const props: Record<string, unknown> = { ...defaults };
    for (const [key, field] of fields)
      props[key] = sentinelValue(field, key, sentinels, defaults[key]);

    let html: string;
    try {
      html = render(name, props);
    } catch (error) {
      issues.push(
        makeIssue(
          "OF-107",
          `Section « ${name} » : le rendu échoue avec du contenu normal (${(error as Error).message}).`,
          where,
        ),
      );
      sections.push({ name, fields: fields.length, renderedFields: 0, file: where?.file });
      continue;
    }
    const found = collect(html);
    let rendered = 0;
    let required = 0;
    for (const [token, info] of sentinels.byToken) {
      const inText = found.text.has(token);
      const inAttr = found.attribute.has(token);
      if (info.required) required++;
      if (inText || inAttr) {
        if (info.required) rendered++;
      } else if (info.required) {
        issues.push(
          makeIssue(
            "OF-104",
            `Section « ${name} » : le champ « ${info.path} » n'est jamais affiché.`,
            where,
          ),
        );
      } else {
        issues.push({
          ...makeIssue(
            "OF-104",
            `Section « ${name} » : « ${info.path} » n'est pas utilisé (pensez à alt={image.alt}).`,
            where,
          ),
          severity: "warning",
        });
      }
      if (info.contentEditable && inAttr && info.fieldType !== "richtext") {
        issues.push(
          makeIssue(
            "OF-108",
            `Section « ${name} » : le champ « ${info.path} » est contentEditable mais utilisé dans un attribut.`,
            where,
          ),
        );
      }
      if (
        !info.contentEditable &&
        !info.inlineOptOut &&
        inText &&
        !inAttr &&
        (info.fieldType === "text" || info.fieldType === "textarea")
      ) {
        issues.push(
          makeIssue(
            "OF-106",
            `Section « ${name} » : le champ « ${info.path} » est affiché comme texte mais n'est pas éditable sur la page.`,
            where,
          ),
        );
      }
    }
    for (const text of new Set(found.leftoverText)) {
      const exact = await locate(siteDir, new RegExp(escapeRegExp(text.slice(0, 40))));
      issues.push(
        makeIssue(
          "OF-101",
          `Section « ${name} » : texte affiché qui ne vient d'aucun champ « ${text.length > 60 ? `${text.slice(0, 57)}…` : text} ».`,
          exact ?? where,
        ),
      );
    }
    sections.push({ name, fields: required, renderedFields: rendered, file: where?.file });

    for (const scenario of ["vide", "long", "partiel"] as const) {
      const edgeProps: Record<string, unknown> = { ...defaults };
      for (const [key, field] of fields)
        edgeProps[key] = scenarioValue(field, scenario, defaults[key]);
      try {
        render(name, edgeProps);
      } catch (error) {
        issues.push(
          makeIssue(
            "OF-107",
            `Section « ${name} » plante avec des valeurs « ${scenario} » : ${(error as Error).message}`,
            where,
          ),
        );
      }
    }
  }
  return { issues, sections };
}
