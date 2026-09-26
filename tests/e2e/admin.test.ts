import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const site =
  process.env.OPENFLOW_E2E_SITE ??
  path.resolve(import.meta.dirname, "../../templates/next-starter");
const PORT = 3100;
const ADMIN = `http://localhost:${PORT}/admin/`;
const OWNER = "proprietaire@exemple.fr";
const NEW_TITLE = "Titre modifié en ligne par le propriétaire";
const SCREENSHOTS = path.join(import.meta.dirname, "screenshots");

let server: ChildProcess;
let browser: Browser;
let page: Page;
let db: Firestore;
const app = initializeApp({ projectId: "demo-openflow" }, "e2e");

async function waitForHttp(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} ne répond pas`);
}

async function waitFor<T>(
  read: () => Promise<T | undefined>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Délai dépassé : ${label}`);
}

async function quickLogin(email: string) {
  await page.getByLabel("Votre adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Connexion rapide (émulateur local)" }).click();
}

beforeAll(async () => {
  db = getFirestore(app);
  const seed = spawnSync(
    path.join(site, "node_modules", ".bin", "openflow"),
    ["seed", "--emulator", "--force"],
    {
      cwd: site,
      stdio: "inherit",
    },
  );
  expect(seed.status).toBe(0);
  rmSync(path.join(site, "out"), { recursive: true, force: true });
  server = spawn(path.join(site, "node_modules", ".bin", "next"), ["dev", "--port", String(PORT)], {
    cwd: site,
    stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_OPENFLOW_EMULATORS: "1", NEXT_TELEMETRY_DISABLED: "1" },
  });
  await waitForHttp(ADMIN, 180_000);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
});

afterAll(async () => {
  await browser?.close();
  server?.kill("SIGINT");
  await deleteApp(app);
});

describe("admin OpenFlow (émulateurs)", () => {
  it("refuses a signed-in user who is not the owner", async () => {
    await page.goto(ADMIN);
    await page
      .getByRole("heading", { name: "Administration de Mon entreprise" })
      .waitFor({ timeout: 120_000 });
    await quickLogin("intrus@exemple.fr");
    await page.getByRole("heading", { name: "Accès refusé" }).waitFor({ timeout: 60_000 });
    await expect(page.getByText("n'est pas le propriétaire")).toBeTruthy();
    await page.getByRole("button", { name: "Changer de compte" }).click();
    await page.getByRole("heading", { name: "Administration de Mon entreprise" }).waitFor();
  });

  it("lets the owner edit a page inline, with autosave", async () => {
    await quickLogin(OWNER);
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor({ timeout: 60_000 });
    await page.screenshot({ path: path.join(SCREENSHOTS, "01-pages.png") });
    const home = page.locator("li", {
      has: page.getByRole("button", { name: "Accueil", exact: true }),
    });
    await home.getByRole("button", { name: "Modifier" }).click();

    const frame = page.frameLocator("#preview-frame");
    const heading = frame.locator("h1");
    await heading.waitFor({ timeout: 120_000 });
    await expect(await heading.innerText()).toContain("Un savoir-faire local");

    // Inline editing: hover makes the text contentEditable, then the owner types directly.
    const editable = heading.locator("[contenteditable]").first();
    await editable.hover();
    await editable.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(NEW_TITLE);
    await page.getByText("Enregistré", { exact: true }).waitFor({ timeout: 30_000 });
    await page.screenshot({ path: path.join(SCREENSHOTS, "02-editor.png") });

    const saved = await waitFor(
      async () => {
        const data = (await db.doc("of_pages/accueil").get()).data();
        const title = data?.data?.content?.[0]?.props?.title;
        return title === NEW_TITLE ? title : undefined;
      },
      30_000,
      "titre enregistré dans Firestore",
    );
    expect(saved).toBe(NEW_TITLE);
  });

  it("uploads an image to Cloud Storage from the image field", async () => {
    const frame = page.frameLocator("#preview-frame");
    await frame.locator("h1").click();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "photo-test.png", mimeType: "image/png", buffer: png });
    const media = await waitFor(
      async () => {
        const snap = await db.collection("of_media").get();
        return snap.docs.find((d) => d.data().name === "photo-test.png")?.data();
      },
      30_000,
      "média enregistré",
    );
    expect(media.path).toMatch(/^openflow\/media\/.+-photo-test\.png$/);
    await page.getByText("Enregistré", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Terminer" }).click();
  });

  it("publishes: snapshot, static build, release live", async () => {
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
    await page.getByRole("button", { name: /^Publier/ }).click();
    await page.getByRole("button", { name: "Mettre en ligne" }).click();
    const release = await waitFor(
      async () => {
        const snap = await db.collection("of_releases").get();
        const live = snap.docs.find(
          (d) => d.data().status === "live" || d.data().status === "failed",
        );
        return live?.data();
      },
      240_000,
      "publication terminée",
    );
    expect(release.status).toBe("live");
    expect(release.builder).toBe("local");
    const html = readFileSync(path.join(site, "out", "index.html"), "utf8");
    expect(html).toContain(NEW_TITLE);
    // Published sections carry the same element markers as the editor (click-to-select, styles).
    expect(html).toMatch(/data-of-s="[^"]+"/);
    expect(html).toMatch(/data-of="title"/);
    expect(existsSync(path.join(site, "out", "admin", "index.html"))).toBe(true);
    await page
      .getByText("Le site est en ligne avec vos dernières modifications.")
      .waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Historique" }).click();
    await page.getByText("En ligne", { exact: true }).first().waitFor();
    await page.screenshot({ path: path.join(SCREENSHOTS, "03-history.png") });
  });

  it("edits global settings (site name)", async () => {
    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("button", { name: "Site et référencement" }).click();
    await page.getByLabel("Nom du site").fill("Boulangerie du Test");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    const name = await waitFor(
      async () => {
        const value = (await db.doc("of_site/settings").get()).data()?.site?.name;
        return value === "Boulangerie du Test" ? value : undefined;
      },
      30_000,
      "nom du site enregistré",
    );
    expect(name).toBe("Boulangerie du Test");
  });
});
