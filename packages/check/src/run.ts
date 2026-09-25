import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Issue } from "@openflow/core";
import { CONFIG_FILES } from "@openflow/core/node";
import { countBySeverity, dedupe } from "./format.js";
import { checkHtml } from "./html.js";
import { checkProject, PROJECT_FILES } from "./project.js";
import { checkRender, type SectionReport } from "./render.js";
import type { CheckLevel } from "./rules.js";
import { analyzeSource, scanSecrets } from "./static.js";

export interface CheckOptions {
  siteDir: string;
  level: CheckLevel;
  /** Restrict the `fast` level to these files (absolute or relative to `siteDir`). */
  files?: string[];
  /** Exported site directory for the `build` level (default `out`). */
  outDir?: string;
}

export interface CheckResult {
  level: CheckLevel;
  issues: Issue[];
  sections: SectionReport[];
  filesAnalyzed: number;
}

const SOURCE_DIRS = ["app", "src", "openflow", "components", "lib"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "out",
  "dist",
  ".openflow",
  ".firebase",
  "seed",
]);
const CODE = /\.(tsx?|jsx?|mjs|cjs)$/;
const TEXT = /\.(tsx?|jsx?|mjs|cjs|json|rules|ya?ml|md)$/;

async function walkDir(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".claude") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...(await walkDir(full)));
    } else if (TEXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Source files of a site checked by the `fast` level. */
export async function listProjectFiles(siteDir: string): Promise<string[]> {
  const files: string[] = [];
  for (const dir of SOURCE_DIRS) files.push(...(await walkDir(path.join(siteDir, dir))));
  for (const file of [...CONFIG_FILES, ...PROJECT_FILES, "functions/src/index.ts"]) {
    const full = path.join(siteDir, file);
    if (existsSync(full) && !files.includes(full)) files.push(full);
  }
  return files;
}

function isContentFile(rel: string): boolean {
  return CONFIG_FILES.includes(rel) || /^openflow\/seed\/.*\.json$/.test(rel);
}

/** Runs the OpenFlow Standard checks up to `level` (each level includes the previous ones). */
export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  const siteDir = path.resolve(options.siteDir);
  const partial = options.level === "fast" && options.files !== undefined;
  const files = partial
    ? options.files!.map((file) => path.resolve(siteDir, file))
    : await listProjectFiles(siteDir);
  const issues: Issue[] = [];
  let sections: SectionReport[] = [];

  let projectFileTouched = !partial;
  let contentTouched = false;
  for (const file of files) {
    if (!existsSync(file)) continue;
    const rel = path.relative(siteDir, file).replaceAll(path.sep, "/");
    if (PROJECT_FILES.includes(rel)) projectFileTouched = true;
    if (isContentFile(rel)) contentTouched = true;
    const text = await readFile(file, "utf8");
    if (!rel.startsWith("openflow/seed/")) issues.push(...scanSecrets(text, rel));
    if (CODE.test(rel)) issues.push(...analyzeSource(text, rel));
  }
  if (projectFileTouched) issues.push(...(await checkProject(siteDir)));

  if (options.level !== "fast" || (partial && contentTouched)) {
    const report = await checkRender(siteDir, { sections: options.level !== "fast" });
    issues.push(...report.issues);
    sections = report.sections;
  }
  if (options.level === "build") issues.push(...(await checkHtml(siteDir, options.outDir)));

  return { level: options.level, issues: dedupe(issues), sections, filesAnalyzed: files.length };
}

/** Writes `.openflow/report.md`: compliance summary to attach to the delivery. */
export async function writeReport(siteDir: string, result: CheckResult): Promise<string> {
  const { errors, warnings } = countBySeverity(result.issues);
  const totalFields = result.sections.reduce((sum, s) => sum + s.fields, 0);
  const rendered = result.sections.reduce((sum, s) => sum + s.renderedFields, 0);
  const editability = totalFields === 0 ? 100 : Math.round((rendered / totalFields) * 100);
  const hardCoded = result.issues.filter((entry) => entry.rule === "OF-101").length;
  const lines = [
    "# Rapport de conformité OpenFlow (norme OFS)",
    "",
    `- Date : ${new Date().toISOString()}`,
    `- Niveau de contrôle : \`${result.level}\``,
    `- Statut : ${errors === 0 ? "**conforme** ✓" : `**non conforme** (${errors} erreur(s))`}`,
    `- Avertissements : ${warnings}`,
    `- Sections : ${result.sections.length} · champs éditables affichés : ${rendered}/${totalFields} (${editability} %)`,
    `- Textes écrits en dur : ${hardCoded}`,
    "",
  ];
  if (result.sections.length > 0) {
    lines.push("| Section | Champs affichés | Fichier |", "|---|---|---|");
    for (const section of result.sections) {
      lines.push(
        `| ${section.name} | ${section.renderedFields}/${section.fields} | ${section.file ?? "—"} |`,
      );
    }
    lines.push("");
  }
  if (result.issues.length > 0) {
    lines.push("## Problèmes", "");
    for (const entry of result.issues) {
      const where = entry.file ? ` \`${entry.file}${entry.line ? `:${entry.line}` : ""}\`` : "";
      lines.push(
        `- **${entry.rule}** (${entry.severity === "error" ? "erreur" : "avertissement"})${where} — ${entry.message}`,
      );
    }
    lines.push("");
  }
  const dir = path.join(siteDir, ".openflow");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "report.md");
  await writeFile(file, lines.join("\n"), "utf8");
  return file;
}
