// Copies templates/next-starter into packages/cli/template (published with the CLI).
// `.gitignore` is renamed to `gitignore` because npm never publishes `.gitignore` files.
import { cp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, "../../../templates/next-starter");
const target = path.resolve(here, "../template");
const skip = new Set([
  "node_modules",
  ".next",
  "out",
  ".openflow",
  "lib",
  ".firebase",
  "next-env.d.ts",
  "tsconfig.tsbuildinfo",
  "test-results",
]);

await rm(target, { recursive: true, force: true });
await cp(source, target, {
  recursive: true,
  filter: (src) => {
    const name = path.basename(src);
    if (skip.has(name)) return false;
    return !(name.startsWith(".env") || name.endsWith(".log") || name === ".snapshot.json");
  },
});
await rename(path.join(target, ".gitignore"), path.join(target, "gitignore")).catch(
  () => undefined,
);
console.log(`template copied to ${path.relative(process.cwd(), target)}`);
