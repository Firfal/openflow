import { existsSync } from "node:fs";
import { cp, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "@openflow/core";
import { CliError, cliVersion, log, templateDir } from "../util.js";

const SKIP = new Set([
  "node_modules",
  ".next",
  "out",
  ".openflow",
  "lib",
  ".firebase",
  "next-env.d.ts",
  "tsconfig.tsbuildinfo",
]);

async function rewritePackageJson(file: string, name: string | undefined, version: string) {
  if (!existsSync(file)) return;
  const pkg = JSON.parse(await readFile(file, "utf8"));
  if (name) pkg.name = name;
  pkg.private = true;
  for (const field of ["dependencies", "devDependencies"]) {
    for (const [dep, range] of Object.entries<string>(pkg[field] ?? {})) {
      if (range.startsWith("workspace:")) pkg[field][dep] = `^${version}`;
    }
  }
  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

/**
 * npm package name of the new site. It must differ from every dependency of the starter
 * (a site named "OpenFlow" would otherwise be called `openflow`, like the CLI it depends on).
 */
export async function sitePackageName(name: string, templateDir: string): Promise<string> {
  const base = slugify(name) || "site-openflow";
  const pkg = JSON.parse(await readFile(path.join(templateDir, "package.json"), "utf8"));
  const taken = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  return taken.has(base) ? `${base}-site` : base;
}

/** `openflow create <dir>`: copies the Next.js starter, ready to be customized by Claude Code. */
export async function create(dir: string, options: { name?: string; project?: string }) {
  const target = path.resolve(dir);
  if (existsSync(target) && (await readdir(target)).length > 0) {
    throw new CliError(`Le dossier ${target} n'est pas vide.`);
  }
  const source = templateDir();
  if (!existsSync(source))
    throw new CliError(`Template introuvable (${source}). Réinstallez le paquet openflow.`);
  await cp(source, target, {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)),
  });
  if (existsSync(path.join(target, "gitignore")))
    await rename(path.join(target, "gitignore"), path.join(target, ".gitignore"));

  const version = await cliVersion();
  const packageName = await sitePackageName(options.name ?? path.basename(target), source);
  await rewritePackageJson(path.join(target, "package.json"), packageName, version);
  await rewritePackageJson(
    path.join(target, "functions", "package.json"),
    `${packageName}-functions`,
    version,
  );

  if (options.name) {
    const configPath = path.join(target, "openflow.config.tsx");
    const config = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      config.replace(/name: "[^"]*"/, `name: ${JSON.stringify(options.name)}`),
    );
  }
  if (options.project) {
    await writeFile(
      path.join(target, ".firebaserc"),
      `${JSON.stringify({ projects: { default: options.project } }, null, 2)}\n`,
    );
  }

  log.ok(`Site créé dans ${path.relative(process.cwd(), target) || "."}`);
  log.info(`
Étapes suivantes :
  cd ${path.relative(process.cwd(), target) || "."}
  npm install
  npx openflow dev        # site + admin sur les émulateurs Firebase (http://localhost:3000/admin/)
  npx openflow check      # conformité à la norme OpenFlow (OFS)
`);
}
