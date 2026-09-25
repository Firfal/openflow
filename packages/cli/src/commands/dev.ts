import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { DEMO_PROJECT_ID } from "@openflow/core";
import { EMULATOR_PORTS } from "../firebase.js";
import { bin, CliError, firebaseCli, log, run } from "../util.js";
import { seed } from "./seed.js";

export const DEV_OWNER = "proprietaire@exemple.fr";

function waitForPort(port: number, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline)
          reject(new CliError(`Le port ${port} ne répond pas (émulateurs Firebase démarrés ?)`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

/** Ensures the functions emulator knows the owner email (functions/.env.local). */
async function ensureDevOwner(site: string, owner: string): Promise<void> {
  const file = path.join(site, "functions", ".env.local");
  const content = existsSync(file) ? await readFile(file, "utf8") : "";
  if (/^OPENFLOW_OWNER_EMAIL=/m.test(content)) return;
  await writeFile(
    file,
    `${content}${content && !content.endsWith("\n") ? "\n" : ""}OPENFLOW_OWNER_EMAIL=${owner}\n`,
  );
}

/**
 * `openflow dev`: Firebase emulators (Auth, Firestore, Storage, Functions) + seed + `next dev`.
 * The admin at /admin/ connects to the emulators; publications build locally into out/.
 */
export async function dev(site: string, options: { port?: string; owner?: string }) {
  const children: ChildProcess[] = [];
  const stop = () => {
    for (const child of children) child.kill("SIGINT");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const owner = options.owner ?? DEV_OWNER;
  await ensureDevOwner(site, owner);
  if (existsSync(path.join(site, "functions", "package.json"))) {
    log.step("Compilation des Cloud Functions");
    await run("npm", ["--prefix", "functions", "run", "build"], { cwd: site });
  }

  log.step("Démarrage des émulateurs Firebase");
  const firebase = firebaseCli(site);
  const emulators = spawn(
    firebase.command,
    [
      ...firebase.args,
      "emulators:start",
      "--project",
      DEMO_PROJECT_ID,
      "--only",
      "auth,firestore,storage,functions",
    ],
    { cwd: site, stdio: "inherit", env: { ...process.env, OPENFLOW_LOCAL_SITE_DIR: site } },
  );
  children.push(emulators);
  emulators.on("exit", (code) => {
    if (code) log.error(`Les émulateurs se sont arrêtés (code ${code}).`);
    stop();
  });
  await waitForPort(EMULATOR_PORTS.firestore);
  await waitForPort(EMULATOR_PORTS.functions);
  await seed(site, { emulator: true });

  const next = bin(site, "next");
  const port = options.port ?? "3000";
  const server = spawn(next.command, [...next.args, "dev", "--port", port], {
    cwd: site,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_OPENFLOW_EMULATORS: "1" },
  });
  children.push(server);
  log.info(`
  Site         http://localhost:${port}/
  Admin        http://localhost:${port}/admin/   (connexion rapide avec ${owner})
  Émulateurs   http://localhost:${EMULATOR_PORTS.ui}/
`);
  await new Promise<void>((resolve) => server.on("exit", () => resolve()));
  stop();
}
