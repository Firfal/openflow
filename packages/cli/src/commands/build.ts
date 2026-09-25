import { mkdir } from "node:fs/promises";
import path from "node:path";
import { loadSite } from "@openflow/check";
import { COLLECTIONS } from "@openflow/core";
import { snapshotFromSeed, writeSnapshotFile } from "@openflow/core/node";
import { markLive } from "@openflow/functions/core";
import { adminApp, firestore } from "../firebase.js";
import { bin, log, run } from "../util.js";

export interface BuildOptions {
  /** Snapshot file to build from (default: a snapshot generated from the seed). */
  snapshot?: string;
  /** Release id to report to Firestore when done (local builder used by the emulators). */
  report?: string;
}

/** Writes a snapshot generated from `openflow/seed` into `.openflow/seed-snapshot.json`. */
export async function seedSnapshot(site: string): Promise<string> {
  const { config } = await loadSite(site);
  const snapshot = await snapshotFromSeed(site, config);
  const file = path.join(site, ".openflow", "seed-snapshot.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeSnapshotFile(file, snapshot);
  return file;
}

/** `openflow build`: static export (`next build`) from a frozen snapshot. */
export async function buildSite(site: string, options: BuildOptions): Promise<void> {
  const snapshot = options.snapshot ? path.resolve(options.snapshot) : await seedSnapshot(site);
  log.step(`next build (contenu : ${path.relative(site, snapshot)})`);
  const next = bin(site, "next");
  try {
    await run(next.command, [...next.args, "build"], {
      cwd: site,
      env: { ...process.env, OPENFLOW_SNAPSHOT: snapshot, NEXT_TELEMETRY_DISABLED: "1" },
    });
    if (options.report) await report(options.report, { ok: true });
    log.ok("Site exporté dans out/");
  } catch (error) {
    if (options.report)
      await report(options.report, { ok: false, error: (error as Error).message });
    throw error;
  }
}

async function report(releaseId: string, result: { ok: boolean; error?: string }) {
  const handle = adminApp({ projectId: process.env.GCLOUD_PROJECT });
  try {
    const db = firestore(handle);
    const finishedAt = new Date().toISOString();
    if (result.ok) {
      await markLive(db, releaseId, { finishedAt, hostingVersion: `local-${releaseId}` });
    } else {
      await db
        .collection(COLLECTIONS.releases)
        .doc(releaseId)
        .update({ status: "failed", finishedAt, error: result.error });
    }
  } finally {
    await handle.close();
  }
}
