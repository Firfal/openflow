import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OpenFlowConfig } from "./config.js";
import {
  PAGE_ID,
  resolveSeedSettings,
  type Seed,
  seedPageSchema,
  seedSettingsSchema,
} from "./seed.js";
import { createSnapshot, parseSnapshot, type Snapshot } from "./snapshot.js";
import type { Issue } from "./validate.js";

export const SEED_DIR = path.join("openflow", "seed");
export const SNAPSHOT_FILE = path.join("openflow", ".snapshot.json");
export const CONFIG_FILES = ["openflow.config.tsx", "openflow.config.ts", "openflow.config.jsx"];

/** Finds the OpenFlow site root (directory containing `openflow.config.*`) from `start` upwards. */
export function findSiteRoot(start: string): string | undefined {
  let dir = path.resolve(start);
  for (;;) {
    if (CONFIG_FILES.some((file) => existsSync(path.join(dir, file)))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function configFile(siteDir: string): string | undefined {
  const found = CONFIG_FILES.find((file) => existsSync(path.join(siteDir, file)));
  return found ? path.join(siteDir, found) : undefined;
}

export interface LoadedSeed {
  seed: Seed | undefined;
  issues: Issue[];
}

/**
 * Reads `openflow/seed/settings.json` and `openflow/seed/pages/*.json`.
 * Structural problems are returned as OF-201 issues instead of throwing.
 */
export async function loadSeed(siteDir: string, config: OpenFlowConfig): Promise<LoadedSeed> {
  const issues: Issue[] = [];
  const seedDir = path.join(siteDir, SEED_DIR);
  const settingsPath = path.join(seedDir, "settings.json");
  let settingsRaw: unknown = {};
  if (existsSync(settingsPath)) {
    try {
      settingsRaw = JSON.parse(await readFile(settingsPath, "utf8"));
    } catch (error) {
      issues.push(jsonIssue(settingsPath, siteDir, error));
    }
  }
  const settingsParsed = seedSettingsSchema.safeParse(settingsRaw);
  if (!settingsParsed.success) {
    for (const issue of settingsParsed.error.issues) {
      issues.push({
        rule: "OF-201",
        severity: "error",
        message: `${issue.path.join(".") || "(racine)"} : ${issue.message}`,
        file: path.relative(siteDir, settingsPath),
      });
    }
  }

  const pagesDir = path.join(seedDir, "pages");
  const pages: Seed["pages"] = [];
  const files = existsSync(pagesDir)
    ? (await readdir(pagesDir)).filter((file) => file.endsWith(".json")).sort()
    : [];
  if (files.length === 0) {
    issues.push({
      rule: "OF-201",
      severity: "error",
      message:
        'Aucune page de départ : ajoutez au moins openflow/seed/pages/accueil.json (slug "").',
      file: path.relative(siteDir, pagesDir),
    });
  }
  for (const file of files) {
    const full = path.join(pagesDir, file);
    const rel = path.relative(siteDir, full);
    const id = file.replace(/\.json$/, "");
    if (!PAGE_ID.test(id)) {
      issues.push({
        rule: "OF-201",
        severity: "error",
        message: `Nom de fichier de page invalide « ${file} » : minuscules, chiffres et tirets.`,
        file: rel,
      });
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(full, "utf8"));
    } catch (error) {
      issues.push(jsonIssue(full, siteDir, error));
      continue;
    }
    const parsed = seedPageSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          rule: "OF-201",
          severity: "error",
          message: `${issue.path.join(".") || "(racine)"} : ${issue.message}`,
          file: rel,
        });
      }
      continue;
    }
    pages.push({ id, ...parsed.data } as Seed["pages"][number]);
  }

  const seed: Seed | undefined = settingsParsed.success
    ? { settings: resolveSeedSettings(settingsParsed.data, config), pages }
    : undefined;
  return { seed, issues };
}

function jsonIssue(file: string, siteDir: string, error: unknown): Issue {
  return {
    rule: "OF-201",
    severity: "error",
    message: `JSON invalide : ${(error as Error).message}`,
    file: path.relative(siteDir, file),
  };
}

export async function readSnapshotFile(file: string): Promise<Snapshot> {
  return parseSnapshot(JSON.parse(await readFile(file, "utf8")));
}

export async function writeSnapshotFile(file: string, snapshot: Snapshot): Promise<void> {
  await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

/** Builds a snapshot from the seed files (used for local previews before any publication). */
export async function snapshotFromSeed(siteDir: string, config: OpenFlowConfig): Promise<Snapshot> {
  const { seed, issues } = await loadSeed(siteDir, config);
  const errors = issues.filter((issue) => issue.severity === "error");
  if (!seed || errors.length > 0) {
    throw new Error(
      `Seed invalide :\n${errors.map((issue) => `- ${issue.file ?? ""} ${issue.message}`).join("\n")}`,
    );
  }
  return createSnapshot({ releaseId: "seed", settings: seed.settings, pages: seed.pages });
}
