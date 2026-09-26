// Captures the real OpenFlow admin editing this landing page, on the Firebase emulators.
//   node visuals/admin.mjs      (Java 11+ required; run `pnpm build` at the repository root first)
// Output: public/images/screens/*.webp, used by the "Captures de l'interface" section.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = (name) => path.join(site, "node_modules", ".bin", name);
const OWNER = "vous@exemple.fr";
const PORT = 3101;

if (!process.argv.includes("--inside")) {
  writeFileSync(
    path.join(site, "functions", ".env.local"),
    `OPENFLOW_OWNER_EMAIL=${OWNER}\nOPENFLOW_LOCAL_SITE_DIR=${site}\n`,
  );
  const build = spawnSync("npm", ["--prefix", "functions", "run", "build"], {
    cwd: site,
    stdio: "inherit",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const run = spawnSync(
    bin("firebase"),
    [
      "emulators:exec",
      "--project",
      "demo-openflow",
      "--only",
      "auth,firestore,storage,functions",
      `node ${fileURLToPath(import.meta.url)} --inside`,
    ],
    { cwd: site, stdio: "inherit" },
  );
  process.exit(run.status ?? 1);
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} ne répond pas`);
}

const outDir = path.join(site, "public", "images", "screens");
mkdirSync(outDir, { recursive: true });

/** Screenshot at 2x, stored as WebP at the requested width. */
async function shoot(page, name, width) {
  const png = await page.screenshot();
  await sharp(png)
    .resize({ width })
    .webp({ quality: 84 })
    .toFile(path.join(outDir, `${name}.webp`));
  console.log(`✓ images/screens/${name}.webp`);
}

const seed = spawnSync(bin("openflow"), ["seed", "--emulator", "--force"], {
  cwd: site,
  stdio: "inherit",
});
if (seed.status !== 0) process.exit(seed.status ?? 1);

const server = spawn(bin("next"), ["dev", "--port", String(PORT)], {
  cwd: site,
  stdio: "ignore",
  env: { ...process.env, NEXT_PUBLIC_OPENFLOW_EMULATORS: "1", NEXT_TELEMETRY_DISABLED: "1" },
});
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
page.on("console", (message) => {
  if (message.type() === "error") console.error(`[navigateur] ${message.text()}`);
});
/** Gallery screens use a smaller viewport: the interface stays legible once scaled down. */
const gallery = () => page.setViewportSize({ width: 1152, height: 720 });
try {
  await waitForHttp(`http://localhost:${PORT}/admin/`, 180_000);
  await page.goto(`http://localhost:${PORT}/admin/`);
  // The Next.js development badge is not part of the product.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByLabel("Votre adresse e-mail").waitFor({ timeout: 120_000 });
  await page.getByLabel("Votre adresse e-mail").fill(OWNER);
  await page.getByRole("button", { name: "Connexion rapide (émulateur local)" }).click();
  await page.getByRole("heading", { name: "Pages", exact: true }).waitFor({ timeout: 60_000 });

  // 1. Editor: the hero title in inline editing, as the owner sees it.
  await page.getByRole("button", { name: "Modifier" }).first().click();
  const heading = page.frameLocator("#preview-frame").locator("h1");
  await heading.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  const editable = heading.locator("[contenteditable]").first();
  await editable.hover();
  await editable.click();
  await page.keyboard.press("End");
  await page.waitForTimeout(800);
  await shoot(page, "editor", 2400);

  // 2. Publish confirmation, over the editor.
  await gallery();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Publier/ }).click();
  await page.getByRole("button", { name: "Mettre en ligne" }).waitFor();
  await page.waitForTimeout(400);
  await shoot(page, "publish", 1200);

  // The real thing: snapshot, local static build, release live.
  await page.getByRole("button", { name: "Mettre en ligne" }).click();
  await page
    .getByText("Le site est en ligne avec vos dernières modifications.")
    .waitFor({ timeout: 300_000 });
  await page.getByRole("button", { name: "Retour aux pages" }).click();
  // Dismiss the notices so they do not cover the next screens.
  const notices = page.locator(".of-notices").getByRole("button", { name: "Fermer" });
  while ((await notices.count()) > 0) await notices.first().click();

  // 3. Page settings: address and search engine fields (from the row's « ⋯ » menu).
  await page
    .getByRole("button", { name: /^Plus d'actions/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /^Paramètres/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(400);
  await shoot(page, "seo", 1200);
  await page.keyboard.press("Escape");

  // 4. Global settings (header and footer shared by every page).
  await page.getByRole("button", { name: "Réglages" }).click();
  await page.frameLocator("#preview-frame").locator("header").first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  await shoot(page, "settings", 1200);
} catch (error) {
  // Keep what the admin showed when a step failed (ignored by git).
  await page
    .screenshot({ path: path.join(site, ".openflow", "admin-capture-error.png") })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  server.kill("SIGINT");
}
