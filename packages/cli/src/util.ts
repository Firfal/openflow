import { type SpawnOptions, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findSiteRoot } from "@openflow/core/node";

export const log = {
  info: (message: string) => console.log(message),
  step: (message: string) => console.log(`\n▸ ${message}`),
  ok: (message: string) => console.log(`✓ ${message}`),
  warn: (message: string) => console.warn(`⚠ ${message}`),
  error: (message: string) => console.error(`✖ ${message}`),
};

export class CliError extends Error {}

/** Runs a command, streaming its output; rejects on non-zero exit. */
export function run(command: string, args: string[], options: SpawnOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new CliError(`${command} ${args.join(" ")} a échoué (code ${code})`)),
    );
  });
}

/** Runs a command and captures stdout. */
export function capture(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"], ...options });
    let out = "";
    child.stdout?.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(out) : reject(new CliError(`${command} a échoué (code ${code})`)),
    );
  });
}

/** Resolves the OpenFlow site directory from `--cwd` or the current directory. */
export function siteDir(cwd?: string): string {
  const start = path.resolve(cwd ?? process.cwd());
  const root = findSiteRoot(start);
  if (!root) {
    throw new CliError(
      `Aucun site OpenFlow trouvé depuis ${start} (openflow.config.tsx introuvable). Créez-en un avec \`npx openflow create mon-site\`.`,
    );
  }
  return root;
}

/** Local binary of a site dependency (`node_modules/.bin/next`), or `npx <name>`. */
export function bin(site: string, name: string): { command: string; args: string[] } {
  const local = path.join(site, "node_modules", ".bin", name);
  return existsSync(local)
    ? { command: local, args: [] }
    : { command: "npx", args: ["--yes", name] };
}

export function firebaseCli(site: string): { command: string; args: string[] } {
  const local = path.join(site, "node_modules", ".bin", "firebase");
  return existsSync(local)
    ? { command: local, args: [] }
    : { command: "npx", args: ["--yes", "firebase-tools@15"] };
}

export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const here = path.dirname(fileURLToPath(import.meta.url));

export async function cliVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(path.join(here, "..", "package.json"), "utf8"));
  return pkg.version as string;
}

/** Directory of the bundled Next.js starter (copied from `templates/next-starter` at build). */
export function templateDir(): string {
  return path.join(here, "..", "template");
}
