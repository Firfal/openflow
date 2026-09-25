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

/** Level `build`: OF-401 … OF-405 on every exported page (admin and Next internals excluded). */
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
  }
  return issues;
}
