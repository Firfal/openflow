import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Issue } from "@openflow/core";
import { type DefaultTreeAdapterMap, parse } from "parse5";
import { getRule } from "./rules.js";

type Node = DefaultTreeAdapterMap["childNode"] | DefaultTreeAdapterMap["document"];
type Element = DefaultTreeAdapterMap["element"];

const IGNORED_PREFIXES = ["/admin", "/_next", "/__/", "/favicon", "/icon", "/apple-icon"];

async function htmlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_next" || entry.name === "admin") continue;
      out.push(...(await htmlFiles(full)));
    } else if (entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

function elements(root: Node): Element[] {
  const out: Element[] = [];
  const visit = (node: Node) => {
    if ("tagName" in node) out.push(node as Element);
    if ("childNodes" in node) for (const child of node.childNodes) visit(child as Node);
    if (node.nodeName === "template" && "content" in node) visit((node as any).content);
  };
  visit(root);
  return out;
}

const attr = (element: Element, name: string) => element.attrs.find((a) => a.name === name)?.value;

function textOf(node: Node): string {
  if (node.nodeName === "#text") return (node as DefaultTreeAdapterMap["textNode"]).value;
  if ("childNodes" in node) return node.childNodes.map((child) => textOf(child as Node)).join("");
  return "";
}

/** Resolves an internal link against the exported `out/` directory. */
function linkExists(outDir: string, href: string): boolean {
  const clean = decodeURIComponent(href.split(/[?#]/)[0] ?? "/");
  if (IGNORED_PREFIXES.some((prefix) => clean.startsWith(prefix))) return true;
  const rel = clean.replace(/^\/+/, "");
  const candidates = [
    path.join(outDir, rel),
    path.join(outDir, rel, "index.html"),
    path.join(outDir, `${rel.replace(/\/$/, "")}.html`),
  ];
  return candidates.some((candidate) => existsSync(candidate) && !candidate.endsWith(path.sep));
}

function pageLabel(outDir: string, file: string): string {
  const rel = path.relative(outDir, file).replaceAll(path.sep, "/");
  if (rel === "index.html") return "/";
  return `/${rel.replace(/(\/)?index\.html$/, "/").replace(/\.html$/, "")}`;
}

function issue(
  ruleId: string,
  file: string,
  message: string,
  severity = getRule(ruleId).severity,
): Issue {
  const rule = getRule(ruleId);
  return { rule: rule.id, severity, message, file, hint: rule.fix };
}

/** Parent of each element, to look up labels and hidden ancestors. */
function parents(root: Node): Map<Element, Element | undefined> {
  const out = new Map<Element, Element | undefined>();
  const visit = (node: Node, parent: Element | undefined) => {
    const element = "tagName" in node ? (node as Element) : undefined;
    if (element) out.set(element, parent);
    if ("childNodes" in node) {
      for (const child of node.childNodes) visit(child as Node, element ?? parent);
    }
  };
  visit(root, undefined);
  return out;
}

const ancestors = (element: Element, parentOf: Map<Element, Element | undefined>) => {
  const out: Element[] = [];
  for (let current = parentOf.get(element); current; current = parentOf.get(current)) {
    out.push(current);
  }
  return out;
};

/** Hidden from people and assistive technologies (honeypots, closed dialogs, `hidden`). */
const hiddenFromAll = (element: Element, parentOf: Map<Element, Element | undefined>) =>
  [element, ...ancestors(element, parentOf)].some(
    (el) => attr(el, "aria-hidden") === "true" || attr(el, "hidden") !== undefined,
  );

/** The accessible name of a link or a button: text, `aria-label`, `title`, image `alt`, SVG title. */
function hasName(element: Element): boolean {
  if (attr(element, "aria-label")?.trim() || attr(element, "aria-labelledby")?.trim()) return true;
  if (attr(element, "title")?.trim()) return true;
  if (textOf(element).trim()) return true;
  return elements(element).some(
    (child) =>
      (child.tagName === "img" && Boolean(attr(child, "alt")?.trim())) ||
      (child.tagName === "svg" && Boolean(attr(child, "aria-label")?.trim())) ||
      (child.tagName === "title" && Boolean(textOf(child).trim())),
  );
}

const FIELD_TYPES_WITHOUT_LABEL = new Set(["hidden", "submit", "reset", "button", "image"]);

/**
 * Level `build`, agent readiness (OF-406 … OF-409): interactive elements with a name, native
 * controls, forms declared to AI assistants (WebMCP), images that keep their room.
 */
function checkAgentReadiness(all: Element[], doc: Node, rel: string, page: string): Issue[] {
  const issues: Issue[] = [];
  const parentOf = parents(doc);
  const labelled = new Set(
    all.filter((el) => el.tagName === "label").flatMap((el) => attr(el, "for") ?? []),
  );
  const describe = (element: Element) => {
    const text = textOf(element).replace(/\s+/g, " ").trim().slice(0, 40);
    const id = attr(element, "id") ?? attr(element, "name") ?? attr(element, "href") ?? "";
    return `<${element.tagName}${id ? ` ${id}` : ""}>${text ? ` « ${text} »` : ""}`;
  };
  for (const element of all) {
    if (hiddenFromAll(element, parentOf)) continue;
    const tag = element.tagName;
    const role = attr(element, "role");
    if ((tag === "a" && attr(element, "href") !== undefined) || tag === "button") {
      if (!hasName(element)) {
        issues.push(
          issue("OF-406", rel, `Page ${page} : ${describe(element)} sans nom accessible.`),
        );
      }
    } else if (tag === "input" || tag === "select" || tag === "textarea") {
      const type = (attr(element, "type") ?? "text").toLowerCase();
      if (tag === "input" && FIELD_TYPES_WITHOUT_LABEL.has(type)) {
        if (type !== "hidden" && !attr(element, "value")?.trim() && !hasName(element)) {
          issues.push(
            issue("OF-406", rel, `Page ${page} : bouton ${describe(element)} sans texte.`),
          );
        }
        continue;
      }
      const id = attr(element, "id");
      const named =
        Boolean(attr(element, "aria-label")?.trim() || attr(element, "aria-labelledby")?.trim()) ||
        Boolean(attr(element, "title")?.trim()) ||
        (id !== undefined && labelled.has(id)) ||
        ancestors(element, parentOf).some((el) => el.tagName === "label");
      if (!named) {
        issues.push(
          issue("OF-406", rel, `Page ${page} : champ ${describe(element)} sans libellé.`),
        );
      }
    } else if (tag === "iframe" && !attr(element, "title")?.trim()) {
      issues.push(
        issue("OF-406", rel, `Page ${page} : <iframe> sans title (${attr(element, "src") ?? ""}).`),
      );
    }
    const native =
      tag === "a" ||
      tag === "button" ||
      tag === "input" ||
      tag === "select" ||
      tag === "textarea" ||
      tag === "summary";
    const tabindex = Number(attr(element, "tabindex"));
    if (
      !native &&
      (role === "button" ||
        role === "link" ||
        attr(element, "onclick") !== undefined ||
        (tabindex >= 0 && (tag === "div" || tag === "span") && !role))
    ) {
      issues.push(
        issue(
          "OF-407",
          rel,
          `Page ${page} : ${describe(element)} cliquable sans être un lien ou un bouton.`,
        ),
      );
    }
    if (tag === "form" && !attr(element, "toolname")) {
      issues.push(
        issue(
          "OF-408",
          rel,
          `Page ${page} : formulaire ${attr(element, "id") ?? attr(element, "action") ?? ""} sans toolname (WebMCP).`,
        ),
      );
    }
    if (
      tag === "img" &&
      (!attr(element, "width") || !attr(element, "height")) &&
      !/\baspect-|\b(h|size)-\d/.test(attr(element, "class") ?? "") &&
      !/aspect-ratio|height/.test(attr(element, "style") ?? "")
    ) {
      issues.push(
        issue(
          "OF-409",
          rel,
          `Page ${page} : image sans dimensions (${attr(element, "src") ?? ""}).`,
        ),
      );
    }
  }
  return issues;
}

/** Level `build`: OF-401 … OF-409 on every exported page (admin and Next internals excluded). */
export async function checkHtml(
  siteDir: string,
  outDir = path.join(siteDir, "out"),
): Promise<Issue[]> {
  const issues: Issue[] = [];
  if (!existsSync(outDir)) {
    throw new Error(
      `Dossier ${path.relative(siteDir, outDir)} introuvable : lancez d'abord \`openflow build\`.`,
    );
  }
  for (const file of await htmlFiles(outDir)) {
    const page = pageLabel(outDir, file);
    // Error pages are not indexed: SEO and content rules do not apply to them.
    if (/^\/(404|500|_not-found|_global-error)(\/|$)/.test(page)) continue;
    const rel = path.relative(siteDir, file);
    const doc = parse(await readFile(file, "utf8"));
    const all = elements(doc);

    const html = all.find((el) => el.tagName === "html");
    if (!html || !attr(html, "lang"))
      issues.push(issue("OF-405", rel, `Page ${page} : <html lang> absent.`));

    const title = all.find((el) => el.tagName === "title");
    if (!title || !textOf(title).trim())
      issues.push(issue("OF-403", rel, `Page ${page} : <title> absent ou vide.`));
    const description = all.find(
      (el) => el.tagName === "meta" && attr(el, "name") === "description",
    );
    if (!description || !attr(description, "content")?.trim()) {
      issues.push(issue("OF-403", rel, `Page ${page} : meta description absente.`, "warning"));
    }

    const headings = all.filter((el) => /^h[1-6]$/.test(el.tagName));
    const h1 = headings.filter((el) => el.tagName === "h1").length;
    if (h1 === 0) issues.push(issue("OF-402", rel, `Page ${page} : aucun titre h1.`));
    if (h1 > 1)
      issues.push(issue("OF-402", rel, `Page ${page} : ${h1} titres h1 (un seul attendu).`));
    let previous = 0;
    for (const heading of headings) {
      const level = Number(heading.tagName[1]);
      if (previous && level > previous + 1) {
        issues.push(
          issue(
            "OF-402",
            rel,
            `Page ${page} : saut de niveau h${previous} → h${level} (« ${textOf(heading).trim().slice(0, 40)} »).`,
          ),
        );
      }
      previous = level;
    }

    for (const img of all.filter((el) => el.tagName === "img")) {
      if (attr(img, "alt") === undefined) {
        issues.push(
          issue(
            "OF-401",
            rel,
            `Page ${page} : image sans alt (${attr(img, "src") ?? "src inconnu"}).`,
          ),
        );
      }
    }

    for (const link of all.filter((el) => el.tagName === "a")) {
      const href = attr(link, "href");
      if (!href?.startsWith("/") || href.startsWith("//")) continue;
      if (!linkExists(outDir, href))
        issues.push(issue("OF-404", rel, `Page ${page} : lien interne cassé ${href}.`));
    }

    issues.push(...checkAgentReadiness(all, doc, rel, page));
  }
  return issues;
}
