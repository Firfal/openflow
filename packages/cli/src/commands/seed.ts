import path from "node:path";
import { loadSite } from "@openflow/check";
import {
  buildSiteSchema,
  COLLECTIONS,
  DOCS,
  ensureIds,
  type PageDoc,
  type SettingsDoc,
} from "@openflow/core";
import { listStaticMedia, loadSeed, writeSnapshotFile } from "@openflow/core/node";
import { snapshotFromFirestore } from "@openflow/functions/core";
import { adminApp, defaultProject, firestore } from "../firebase.js";
import { CliError, log } from "../util.js";
import { seedSnapshot } from "./build.js";

export interface SeedOptions {
  project?: string;
  emulator?: boolean;
  /** Overwrite existing documents (never used by `deploy`: the owner's content wins). */
  force?: boolean;
}

/**
 * Imports `openflow/seed` into Firestore. Existing documents are kept unless `force` is set, so
 * re-deploying the code never overwrites what the owner edited.
 */
export async function seed(
  site: string,
  options: SeedOptions,
): Promise<{ created: number; kept: number }> {
  const { config } = await loadSite(site);
  const { seed: content, issues } = await loadSeed(site, config);
  const errors = issues.filter((issue) => issue.severity === "error");
  if (!content || errors.length > 0) {
    throw new CliError(
      `Seed invalide :\n${errors.map((issue) => `  ${issue.file ?? ""} ${issue.message}`).join("\n")}`,
    );
  }
  const handle = adminApp({
    projectId: options.project ?? (options.emulator ? undefined : await defaultProject(site)),
    emulator: options.emulator,
  });
  let created = 0;
  let kept = 0;
  let media = 0;
  try {
    const db = firestore(handle);
    const now = new Date().toISOString();
    const settingsRef = db.collection(COLLECTIONS.site).doc(DOCS.settings);
    if (options.force || !(await settingsRef.get()).exists) {
      const settings: SettingsDoc = {
        ...content.settings,
        updatedAt: now,
        updatedBy: "openflow seed",
      };
      await settingsRef.set(JSON.parse(JSON.stringify(settings)));
      created++;
    } else kept++;
    for (const page of content.pages) {
      const ref = db.collection(COLLECTIONS.pages).doc(page.id);
      if (!options.force && (await ref.get()).exists) {
        kept++;
        continue;
      }
      const doc: PageDoc = {
        slug: page.slug,
        title: page.title,
        status: page.status,
        seo: page.seo,
        data: ensureIds(page.data),
        updatedAt: now,
        updatedBy: "openflow seed",
      };
      await ref.set(JSON.parse(JSON.stringify(doc)));
      created++;
    }
    // Schema of the sections (code, not content: always replaced), read by the MCP server.
    await db
      .collection(COLLECTIONS.system)
      .doc(DOCS.schema)
      .set(JSON.parse(JSON.stringify(buildSiteSchema(config))));
    // Images and videos of public/ go into the media library (the owner can reuse them).
    for (const { id, doc } of await listStaticMedia(site)) {
      const ref = db.collection(COLLECTIONS.media).doc(id);
      if (!options.force && (await ref.get()).exists) continue;
      await ref.set(JSON.parse(JSON.stringify(doc)));
      media++;
    }
  } finally {
    await handle.close();
  }
  log.ok(
    `Contenu initial importé dans ${handle.emulator ? "l'émulateur" : handle.projectId} : ${created} document(s) créé(s), ${kept} conservé(s).`,
  );
  if (media > 0) log.ok(`Médiathèque : ${media} image(s) du site ajoutée(s).`);
  return { created, kept };
}

/** `openflow snapshot`: writes the current content (seed or Firestore) as a snapshot file. */
export async function snapshot(
  site: string,
  options: { from?: string; out?: string; project?: string; emulator?: boolean },
) {
  const out = path.resolve(site, options.out ?? path.join("openflow", ".snapshot.json"));
  if ((options.from ?? "seed") === "seed") {
    const file = await seedSnapshot(site);
    const { readSnapshotFile } = await import("@openflow/core/node");
    await writeSnapshotFile(out, await readSnapshotFile(file));
  } else {
    const handle = adminApp({
      projectId: options.project ?? (options.emulator ? undefined : await defaultProject(site)),
      emulator: options.emulator,
    });
    try {
      await writeSnapshotFile(
        out,
        await snapshotFromFirestore(firestore(handle), `local-${Date.now().toString(36)}`),
      );
    } finally {
      await handle.close();
    }
  }
  log.ok(`Snapshot écrit : ${path.relative(process.cwd(), out)}`);
}
