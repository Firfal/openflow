import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliError, capture, log, run } from "./util.js";

/**
 * A site that lives in the OpenFlow monorepo (or in a fork) depends on `workspace:*` packages
 * that are not on npm. Cloud Build and Cloud Functions install dependencies with npm, so
 * `openflow deploy` stages a standalone copy of the site where those packages are packed into
 * `vendor/*.tgz` and referenced as `file:` dependencies (plus `overrides` for the nested ones).
 */

type PackageJson = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

const DEP_FIELDS = ["dependencies", "devDependencies"] as const;

async function readJson(file: string): Promise<PackageJson> {
  return JSON.parse(await readFile(file, "utf8"));
}

/** Names of the `workspace:` dependencies declared by a package.json (runtime and dev). */
export function workspaceDeps(pkg: PackageJson, fields: readonly string[] = DEP_FIELDS): string[] {
  const names = new Set<string>();
  for (const field of fields) {
    const deps = pkg[field as keyof PackageJson] as Record<string, string> | undefined;
    for (const [name, range] of Object.entries(deps ?? {})) {
      if (range.startsWith("workspace:")) names.add(name);
    }
  }
  return [...names];
}

/** Closest directory above `start` holding a `pnpm-workspace.yaml`. */
export function findWorkspaceRoot(start: string): string | undefined {
  let dir = path.resolve(start);
  while (true) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Maps each workspace package name to its directory (`packages:` globs of the form `dir` or `dir/*`). */
export async function workspacePackages(root: string): Promise<Map<string, string>> {
  const yaml = await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8");
  const block = yaml.match(/^packages:\s*\n((?:\s+-\s+.*\n?)+)/m)?.[1] ?? "";
  const patterns = [...block.matchAll(/-\s+["']?([^"'\n]+?)["']?\s*$/gm)].map((m) => m[1] ?? "");
  const map = new Map<string, string>();
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) continue;
    const dirs: string[] = [];
    if (pattern.endsWith("/*")) {
      const base = path.join(root, pattern.slice(0, -2));
      if (!existsSync(base)) continue;
      for (const entry of await readdir(base, { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.push(path.join(base, entry.name));
      }
    } else {
      dirs.push(path.join(root, pattern));
    }
    for (const dir of dirs) {
      const file = path.join(dir, "package.json");
      if (!existsSync(file)) continue;
      const name = (await readJson(file)).name;
      if (name) map.set(name, dir);
    }
  }
  return map;
}

/** The workspace packages needed by `roots`, including their own runtime `workspace:` dependencies. */
export async function workspaceClosure(
  roots: string[],
  packages: Map<string, string>,
): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    const dir = packages.get(name);
    if (!dir) throw new CliError(`Paquet ${name} introuvable dans l'espace de travail pnpm.`);
    seen.add(name);
    const pkg = await readJson(path.join(dir, "package.json"));
    queue.push(...workspaceDeps(pkg, ["dependencies"]));
  }
  return [...seen].sort();
}

/**
 * Points every `workspace:` dependency at its tarball and forces the nested ones with `overrides`
 * (npm only accepts an override of a direct dependency when both specs are identical).
 */
export function rewriteForVendor(pkg: PackageJson, tarballs: Map<string, string>): PackageJson {
  const out: PackageJson = structuredClone(pkg);
  for (const field of DEP_FIELDS) {
    const deps = out[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps)) {
      if (!range.startsWith("workspace:")) continue;
      const tarball = tarballs.get(name);
      if (!tarball) throw new CliError(`Aucune archive pour ${name}.`);
      deps[name] = tarball;
    }
  }
  if (tarballs.size > 0) out.overrides = { ...out.overrides, ...Object.fromEntries(tarballs) };
  return out;
}

/** Packs the packages with pnpm (which turns their own `workspace:*` ranges into versions). */
async function packAll(names: string[], packages: Map<string, string>, destination: string) {
  const files = new Map<string, string>();
  for (const name of names) {
    const dir = packages.get(name) as string;
    if (!existsSync(path.join(dir, "dist"))) {
      throw new CliError(`${name} n'est pas compilé : lancez \`pnpm build\` à la racine du dépôt.`);
    }
    const before = new Set(await readdir(destination));
    await capture("pnpm", ["pack", "--pack-destination", destination], { cwd: dir });
    const created = (await readdir(destination)).filter((file) => !before.has(file));
    const tarball = created.find((file) => file.endsWith(".tgz"));
    if (!tarball) throw new CliError(`pnpm pack n'a produit aucune archive pour ${name}.`);
    files.set(name, tarball);
  }
  return files;
}

export interface StagedSite {
  /** Standalone copy of the site, ready for `firebase deploy` and for the source archive. */
  dir: string;
  /** Vendored package names. */
  vendored: string[];
}

/**
 * Returns `undefined` for a regular site (all dependencies come from npm). Otherwise builds the
 * standalone copy: sources + `.env*` of the functions, `vendor/` for the site and for `functions/`,
 * rewritten package.json files, npm lockfiles, and the installed functions (needed by the Firebase
 * CLI to discover them).
 */
export async function stageWorkspaceSite(
  site: string,
  files: string[],
): Promise<StagedSite | undefined> {
  const sitePkg = await readJson(path.join(site, "package.json"));
  const functionsFile = path.join(site, "functions", "package.json");
  const functionsPkg = existsSync(functionsFile) ? await readJson(functionsFile) : undefined;
  const siteDirect = workspaceDeps(sitePkg);
  const functionsDirect = functionsPkg ? workspaceDeps(functionsPkg) : [];
  if (siteDirect.length === 0 && functionsDirect.length === 0) return undefined;

  const root = findWorkspaceRoot(site);
  if (!root) {
    throw new CliError(
      "Des dépendances `workspace:` sont déclarées, mais aucun pnpm-workspace.yaml n'a été trouvé.",
    );
  }
  const packages = await workspacePackages(root);
  const siteNames = await workspaceClosure(siteDirect, packages);
  const functionsNames = await workspaceClosure(functionsDirect, packages);
  const names = [...new Set([...siteNames, ...functionsNames])].sort();
  log.info(`Paquets OpenFlow non publiés, embarqués dans vendor/ : ${names.join(", ")}`);

  const dir = await mkdtemp(path.join(tmpdir(), "openflow-deploy-"));
  for (const file of files) {
    if (file === "pnpm-lock.yaml" || file === "functions/pnpm-lock.yaml") continue;
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await copyFile(path.join(site, file), path.join(dir, file));
  }
  // Functions parameters (owner e-mail…): deployed with the functions, never archived.
  if (existsSync(path.join(site, "functions"))) {
    for (const entry of await readdir(path.join(site, "functions"))) {
      if (/^\.env(\..+)?$/.test(entry)) {
        await copyFile(path.join(site, "functions", entry), path.join(dir, "functions", entry));
      }
    }
  }

  const vendor = path.join(dir, "vendor");
  await mkdir(vendor, { recursive: true });
  const packed = await packAll(names, packages, vendor);
  const specs = (subset: string[]) =>
    new Map(subset.map((name) => [name, `file:vendor/${packed.get(name)}`]));

  await writeFile(
    path.join(dir, "package.json"),
    `${JSON.stringify(rewriteForVendor(sitePkg, specs(siteNames)), null, 2)}\n`,
  );
  const npm = ["--no-audit", "--no-fund", "--ignore-scripts"];
  await run("npm", ["install", "--package-lock-only", ...npm], { cwd: dir });

  if (functionsPkg) {
    // Only `functions/` is uploaded to Cloud Functions: it gets its own copy of the tarballs.
    const functionsDir = path.join(dir, "functions");
    await mkdir(path.join(functionsDir, "vendor"), { recursive: true });
    for (const name of functionsNames) {
      const file = packed.get(name) as string;
      await copyFile(path.join(vendor, file), path.join(functionsDir, "vendor", file));
    }
    await writeFile(
      path.join(functionsDir, "package.json"),
      `${JSON.stringify(rewriteForVendor(functionsPkg, specs(functionsNames)), null, 2)}\n`,
    );
    await run("npm", ["install", ...npm], { cwd: functionsDir });
  }
  return { dir, vendored: names };
}
