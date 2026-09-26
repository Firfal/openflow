// End-to-end tests of the starter site on the Firebase emulators:
//   1. security rules (Firestore, Storage)
//   2. admin scenario with Playwright (owner login, inline edit, autosave, publish, history)
// Prerequisites: `pnpm build` at the repository root and Java 11+ for the emulators.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// OPENFLOW_E2E_SITE=sites/landing runs the site-agnostic tests against another site.
const site = path.resolve(
  process.env.OPENFLOW_E2E_SITE ?? path.resolve(here, "../../templates/next-starter"),
);

writeFileSync(
  path.join(site, "functions", ".env.local"),
  `OPENFLOW_OWNER_EMAIL=proprietaire@exemple.fr\nOPENFLOW_LOCAL_SITE_DIR=${site}\n`,
);
const build = spawnSync("npm", ["--prefix", "functions", "run", "build"], {
  cwd: site,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const vitest = path.join(here, "node_modules", ".bin", "vitest");
const result = spawnSync(
  path.join(site, "node_modules", ".bin", "firebase"),
  [
    "emulators:exec",
    "--project",
    "demo-openflow",
    "--only",
    "auth,firestore,storage,functions",
    `${vitest} run --root ${here} ${process.argv.slice(2).join(" ")}`,
  ],
  { cwd: site, stdio: "inherit", env: { ...process.env, OPENFLOW_E2E_SITE: site } },
);
process.exit(result.status ?? 1);
