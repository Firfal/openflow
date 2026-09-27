// Weight of the admin's login screen, measured on a site's static export (`out/`), and budget.
//
//   node admin-weight.mjs <site>/out [--budget] [--details]
//
// The export is served locally with a placeholder Firebase configuration: the login screen shows
// without any network access. Every script, style sheet and font it downloads is counted, with its
// Brotli size (what Firebase Hosting sends). With --budget, the run fails when the login screen
// downloads more than the budget, or code only the dashboard or the editor needs.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { brotliCompressSync } from "node:zlib";
import { chromium } from "playwright";

/** Budget of the login screen (Brotli). Raise it only with a reason. */
export const LOGIN_BUDGET_KB = { js: 175, css: 25, font: 60 };

/** Code that must not load before the owner is signed in (dashboard and editor stages). */
const LATER_STAGES = [
  { name: "l'éditeur visuel (Puck)", pattern: /_PuckLayout|puck-drop-zone/ },
  { name: "le texte riche (ProseMirror)", pattern: /ProseMirror-/ },
  { name: "Firestore", pattern: /firestore\.googleapis\.com/ },
  { name: "les outils de l'assistant IA (WebMCP)", pattern: /get_site_overview/ },
];

const [outDir, ...flags] = process.argv.slice(2);
if (!outDir) {
  console.error("Usage : node admin-weight.mjs <site>/out [--budget]");
  process.exit(2);
}
const TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};
const FIREBASE = {
  apiKey: "weight",
  authDomain: "localhost",
  projectId: "demo-weight",
  appId: "x",
};
const server = createServer(async (req, res) => {
  let file = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
  if (file === "/__/firebase/init.json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(FIREBASE));
    return;
  }
  if (file.endsWith("/")) file += "index.html";
  try {
    const body = await readFile(path.join(outDir, file));
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
const files = [];
page.on("response", async (response) => {
  const url = new URL(response.url());
  if (url.origin !== origin || !response.ok()) return;
  const ext = path.extname(url.pathname);
  if (![".js", ".css", ".woff2"].includes(ext)) return;
  const body = await response.body().catch(() => undefined);
  if (!body) return;
  const text = ext === ".woff2" ? "" : body.toString("utf8");
  files.push({
    path: url.pathname,
    kind: ext === ".js" ? "js" : ext === ".css" ? "css" : "font",
    raw: body.length,
    brotli: ext === ".woff2" ? body.length : brotliCompressSync(body).length,
    stages:
      ext === ".js" ? LATER_STAGES.filter((s) => s.pattern.test(text)).map((s) => s.name) : [],
  });
});
await page.goto(`${origin}/admin/`);
await page.getByLabel("Votre adresse e-mail").waitFor({ timeout: 60_000 });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1500);
await browser.close();
server.close();

const kb = (n) => Math.round(n / 1024);
const sum = (kind, key) => files.filter((f) => f.kind === kind).reduce((a, f) => a + f[key], 0);
console.log(`Écran de connexion de l'admin (${outDir}) :`);
for (const kind of ["js", "css", "font"]) {
  console.log(
    `  ${kind.padEnd(5)} ${String(files.filter((f) => f.kind === kind).length).padStart(3)} fichier(s)  ${String(kb(sum(kind, "raw"))).padStart(5)} Ko bruts  ${String(kb(sum(kind, "brotli"))).padStart(5)} Ko compressés`,
  );
}
if (flags.includes("--details")) {
  for (const f of [...files].sort((a, b) => b.brotli - a.brotli)) {
    console.log(`    ${String(kb(f.brotli)).padStart(4)} Ko  ${f.path}`);
  }
}
const early = [...new Set(files.flatMap((f) => f.stages))];
if (early.length) console.log(`  Chargé trop tôt : ${early.join(", ")}`);

if (flags.includes("--budget")) {
  const errors = [];
  if (kb(sum("js", "brotli")) > LOGIN_BUDGET_KB.js) {
    errors.push(`JavaScript : ${kb(sum("js", "brotli"))} Ko > ${LOGIN_BUDGET_KB.js} Ko`);
  }
  if (kb(sum("css", "brotli")) > LOGIN_BUDGET_KB.css) {
    errors.push(`CSS : ${kb(sum("css", "brotli"))} Ko > ${LOGIN_BUDGET_KB.css} Ko`);
  }
  // Only the admin's own font: the site's fonts belong to the page preview.
  if (kb(sum("font", "brotli")) > LOGIN_BUDGET_KB.font) {
    errors.push(`Polices : ${kb(sum("font", "brotli"))} Ko > ${LOGIN_BUDGET_KB.font} Ko`);
  }
  for (const stage of early) errors.push(`${stage} ne doit se charger qu'après la connexion`);
  if (errors.length) {
    console.error(`Budget de l'admin dépassé :\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }
  console.log("Budget de l'admin respecté ✓");
}
