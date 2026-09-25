import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { COLLECTIONS, DOCS, type ReleaseDoc, type SourceDoc, STORAGE_PATHS } from "@openflow/core";
import { snapshotFromFirestore, snapshotPath, startCloudBuild } from "@openflow/functions/core";
import { adminApp, defaultProject, firestore, storage } from "../firebase.js";
import { CliError, capture, firebaseCli, log, run } from "../util.js";
import { check } from "./check.js";
import { seed } from "./seed.js";

const EXCLUDED =
  /(^|\/)(node_modules|\.next|out|\.openflow|\.firebase|\.git)(\/|$)|^functions\/lib\/|(^|\/)\.env(\..*)?$|^openflow\/\.snapshot\.json$|\.log$/;

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replaceAll(path.sep, "/");
    if (EXCLUDED.test(rel)) continue;
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(rel);
  }
  return out;
}

/** Lists the site sources (git-tracked + untracked non-ignored files, or a filtered walk). */
export async function sourceFiles(site: string): Promise<string[]> {
  let files: string[];
  try {
    files = (
      await capture("git", ["ls-files", "-co", "--exclude-standard"], {
        cwd: site,
        stdio: ["ignore", "pipe", "ignore"],
      })
    )
      .split("\n")
      .filter(Boolean);
  } catch {
    files = await walk(site);
  }
  return files.filter((file) => !EXCLUDED.test(file) && existsSync(path.join(site, file)));
}

/** Creates `source.tgz` of the site (what Cloud Build rebuilds at each publication). */
export async function archiveSource(
  site: string,
): Promise<{ file: string; sha256: string; count: number }> {
  const files = await sourceFiles(site);
  if (!files.includes("package.json"))
    throw new CliError("package.json introuvable dans les sources du site.");
  const dir = await mkdtemp(path.join(tmpdir(), "openflow-source-"));
  const list = path.join(dir, "files.txt");
  const file = path.join(dir, "source.tgz");
  await writeFile(list, `${files.join("\n")}\n`);
  await run("tar", ["-czf", file, "-C", site, "-T", list], { stdio: "ignore" });
  const sha256 = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
  return { file, sha256, count: files.length };
}

export interface DeployOptions {
  project?: string;
  owner?: string;
  bucket?: string;
  /** Deploy even if the OpenFlow Standard check fails (logged). */
  force?: boolean;
  /** Skip the first publication. */
  noPublish?: boolean;
}

/**
 * `openflow deploy`: checks the site, deploys rules and functions, uploads the source archive,
 * imports the seed (without overwriting the owner's content) and starts a publication.
 */
export async function deploy(site: string, options: DeployOptions) {
  const projectId = options.project ?? (await defaultProject(site));
  if (!projectId)
    throw new CliError("Précisez le projet Firebase : --project <id> (ou .firebaserc).");

  log.step("Contrôle de conformité (norme OpenFlow, niveau build)");
  const errors = await check([], { level: "build", cwd: site, build: true });
  if (errors > 0 && !options.force) {
    throw new CliError(
      `${errors} erreur(s) de conformité : corrigez-les, ou relancez avec --force (déconseillé).`,
    );
  }
  if (errors > 0) log.warn(`Déploiement forcé malgré ${errors} erreur(s) de conformité.`);

  const envFile = path.join(site, "functions", `.env.${projectId}`);
  if (options.owner) {
    const existing = existsSync(envFile) ? await readFile(envFile, "utf8") : "";
    const lines = existing
      .split("\n")
      .filter((line) => line && !line.startsWith("OPENFLOW_OWNER_EMAIL="));
    lines.push(`OPENFLOW_OWNER_EMAIL=${options.owner}`);
    await writeFile(envFile, `${lines.join("\n")}\n`);
  } else if (
    !existsSync(envFile) ||
    !(await readFile(envFile, "utf8")).includes("OPENFLOW_OWNER_EMAIL=")
  ) {
    throw new CliError("Précisez l'e-mail du propriétaire : --owner client@exemple.fr");
  }

  log.step("Déploiement des règles de sécurité et des Cloud Functions");
  const firebase = firebaseCli(site);
  await run(
    firebase.command,
    [
      ...firebase.args,
      "deploy",
      "--only",
      "firestore:rules,storage,functions",
      "--project",
      projectId,
    ],
    { cwd: site },
  );

  const handle = adminApp({ projectId, bucket: options.bucket });
  try {
    const bucket = storage(handle).bucket();
    if (!(await bucket.exists())[0]) {
      throw new CliError(
        `Bucket ${bucket.name} introuvable : activez Cloud Storage dans la console Firebase, ou passez --bucket.`,
      );
    }
    log.step("Envoi du code source du site");
    const archive = await archiveSource(site);
    const destination = `${STORAGE_PATHS.source}/${new Date().toISOString().replace(/[:.]/g, "-")}-${archive.sha256.slice(0, 12)}.tgz`;
    await bucket.upload(archive.file, {
      destination,
      contentType: "application/gzip",
      resumable: false,
    });
    await rm(path.dirname(archive.file), { recursive: true, force: true });
    const db = firestore(handle);
    const source: SourceDoc = {
      path: destination,
      sha256: archive.sha256,
      uploadedAt: new Date().toISOString(),
      uploadedBy: "openflow deploy",
    };
    await db.collection(COLLECTIONS.system).doc(DOCS.source).set(source);
    log.ok(`${archive.count} fichiers envoyés (${destination})`);

    log.step("Contenu initial");
    await seed(site, { project: projectId });

    if (!options.noPublish) {
      log.step("Première publication");
      const ref = db.collection(COLLECTIONS.releases).doc();
      const snapshot = await snapshotFromFirestore(db, ref.id);
      const file = snapshotPath(ref.id);
      await bucket
        .file(file)
        .save(JSON.stringify(snapshot), { contentType: "application/json", resumable: false });
      const release: ReleaseDoc = {
        status: "queued",
        createdAt: new Date().toISOString(),
        createdBy: "openflow deploy",
        snapshotPath: file,
        sourcePath: destination,
        builder: "cloud-build",
        pageCount: snapshot.pages.length,
      };
      await ref.set(release);
      const started = await startCloudBuild({
        projectId,
        bucket: bucket.name,
        sourcePath: destination,
        snapshotPath: file,
        releaseId: ref.id,
        serviceAccount: process.env.OPENFLOW_BUILD_SERVICE_ACCOUNT,
      });
      await ref.update({ status: "building", ...started });
      log.ok(`Build lancé : ${started.logUrl}`);
    }
  } finally {
    await handle.close();
  }

  log.info(`
Livraison :
  1. Console Firebase > Authentication > Méthodes de connexion : activez « Lien par e-mail » et Google.
  2. Envoyez au propriétaire l'adresse https://<votre-domaine>/admin/ : il se connecte avec ${options.owner ?? "son e-mail"}.
  3. Chaque « Publier » reconstruit le site (2 à 4 min). Relancez \`openflow deploy\` après toute modification du code.
`);
}
