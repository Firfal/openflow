import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OpenFlowConfig } from "./config.js";
import type { MediaDoc } from "./model.js";
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

/** Width and height read from an image header (PNG, JPEG, GIF, WebP, SVG), when available. */
export function imageDimensions(data: Buffer, ext: string): { width?: number; height?: number } {
  const e = ext.toLowerCase().replace(/^\./, "");
  try {
    if (e === "png" && data.length > 24) {
      return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    }
    if (e === "gif" && data.length > 10) {
      return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
    }
    if (e === "webp" && data.toString("ascii", 0, 4) === "RIFF") {
      const chunk = data.toString("ascii", 12, 16);
      if (chunk === "VP8X") {
        return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
      }
      if (chunk === "VP8L") {
        const bits = data.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
      if (chunk === "VP8 ") {
        return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
      }
    }
    if ((e === "jpg" || e === "jpeg") && data[0] === 0xff && data[1] === 0xd8) {
      let offset = 2;
      while (offset < data.length) {
        if (data[offset] !== 0xff) return {};
        const marker = data[offset + 1] ?? 0;
        const length = data.readUInt16BE(offset + 2);
        // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
      }
    }
    if (e === "svg") {
      const svg = data.toString("utf8", 0, 2000);
      const w = svg.match(/<svg[^>]*\swidth="([\d.]+)(px)?"/)?.[1];
      const h = svg.match(/<svg[^>]*\sheight="([\d.]+)(px)?"/)?.[1];
      if (w && h) return { width: Math.round(Number(w)), height: Math.round(Number(h)) };
      const box = svg.match(/viewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/);
      if (box) return { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) };
    }
  } catch {
    // truncated or unusual file: no dimensions
  }
  return {};
}

const STATIC_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
};

/**
 * Images and videos shipped in `public/` (seed screenshots, illustrations…), as media library
 * entries: the owner can pick them again after replacing them. Document ids are stable
 * (`static-<hash of the path>`), so re-running the seed never duplicates them.
 */
export async function listStaticMedia(
  siteDir: string,
): Promise<Array<{ id: string; doc: MediaDoc }>> {
  const root = path.join(siteDir, "public");
  const out: Array<{ id: string; doc: MediaDoc }> = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      const contentType = STATIC_TYPES[ext];
      if (!contentType || entry.name.startsWith(".")) continue;
      const publicPath = `/${path.relative(root, full).split(path.sep).join("/")}`;
      const data = await readFile(full);
      const size = (await stat(full)).size;
      const id = `static-${createHash("sha1").update(publicPath).digest("hex").slice(0, 16)}`;
      out.push({
        id,
        doc: {
          path: publicPath,
          url: publicPath,
          name: entry.name,
          contentType,
          size,
          ...(contentType.startsWith("image/") ? imageDimensions(data, ext) : {}),
          source: "static",
          createdAt: new Date(0).toISOString(),
        },
      });
    }
  };
  await walk(root);
  return out.sort((a, b) => a.doc.path.localeCompare(b.doc.path));
}
