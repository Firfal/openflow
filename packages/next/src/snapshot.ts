import { existsSync } from "node:fs";
import path from "node:path";
import type { OpenFlowConfig, Snapshot, SnapshotPage } from "@openflow/core";
import { readSnapshotFile, SNAPSHOT_FILE, snapshotFromSeed } from "@openflow/core/node";

let cached: { key: string; promise: Promise<Snapshot> } | undefined;

/** Where the published content comes from during `next build` / `next dev`. */
export function snapshotSource(cwd = process.cwd()): { kind: "file" | "seed"; path: string } {
  const fromEnv = process.env.OPENFLOW_SNAPSHOT;
  if (fromEnv) return { kind: "file", path: path.resolve(cwd, fromEnv) };
  const local = path.join(cwd, SNAPSHOT_FILE);
  if (existsSync(local)) return { kind: "file", path: local };
  return { kind: "seed", path: cwd };
}

/**
 * Returns the frozen content to render. During a publication, `OPENFLOW_SNAPSHOT` points to the
 * snapshot written by the `openflowPublish` function; locally, `openflow/.snapshot.json` or the
 * seed files are used. Firestore is never read at build time (OF-302).
 */
export function getSnapshot(config: OpenFlowConfig): Promise<Snapshot> {
  const source = snapshotSource();
  const key = `${source.kind}:${source.path}`;
  if (cached?.key !== key || process.env.NODE_ENV === "development") {
    cached = {
      key,
      promise:
        source.kind === "file"
          ? readSnapshotFile(source.path)
          : snapshotFromSeed(source.path, config),
    };
  }
  return cached.promise;
}

export async function getPages(config: OpenFlowConfig): Promise<SnapshotPage[]> {
  return (await getSnapshot(config)).pages;
}

/** Global settings values (`config.settings`) for layouts: header, footer, navigation… */
export async function getSettings<T = Record<string, any>>(config: OpenFlowConfig): Promise<T> {
  const snapshot = await getSnapshot(config);
  return { ...(config.settings?.defaultProps ?? {}), ...snapshot.settings } as T;
}

/** Site-level settings (name, lang, url, description). */
export async function getSite(config: OpenFlowConfig): Promise<Snapshot["site"]> {
  return (await getSnapshot(config)).site;
}
