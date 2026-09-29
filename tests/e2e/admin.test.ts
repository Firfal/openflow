import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const site =
  process.env.CMS_E2E_SITE ?? path.resolve(import.meta.dirname, "../../templates/next-starter");
const PORT = 3100;
const ADMIN = `http://localhost:${PORT}/admin/`;
const OWNER = "proprietaire@exemple.fr";
const NEW_TITLE = "Titre modifié en ligne par le propriétaire";
const ITEM_TITLE = "Portes ouvertes du samedi 4 octobre";
const SCHEDULED_TITLE = "Soldes de janvier";
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

/** Audience counters of every day and shard, added up. */
async function statsTotal() {
  const total = {
    views: 0,
    visits: 0,
    pages: {} as Record<string, number>,
    sources: {} as Record<string, number>,
    devices: {} as Record<string, number>,
    aiPages: {} as Record<string, number>,
    /** Page loads whose speed was measured, per Core Web Vital. */
    vitals: {} as Record<string, number>,
  };
  for (const doc of (await db.collection("cms_stats").get()).docs) {
    const data = doc.data();
    total.views += data.views ?? 0;
    total.visits += data.visits ?? 0;
    for (const [vital, ratings] of Object.entries(
      (data.vitals ?? {}) as Record<string, Record<string, number>>,
    )) {
      total.vitals[vital] =
        (total.vitals[vital] ?? 0) + Object.values(ratings).reduce((sum, n) => sum + n, 0);
    }
    for (const key of ["pages", "sources", "devices", "aiPages"] as const) {
      for (const [name, count] of Object.entries((data[key] ?? {}) as Record<string, number>)) {
        total[key][name] = (total[key][name] ?? 0) + count;
      }
    }
  }
  return total;
}

/** A place of the sidebar (exact name, inside the « Navigation » landmark: no clash with the page). */
async function nav(name: string) {
  await page
    .getByRole("navigation", { name: "Navigation", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
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
    env: { ...process.env, NEXT_PUBLIC_CMS_EMULATORS: "1", NEXT_TELEMETRY_DISABLED: "1" },
  });
  await waitForHttp(ADMIN, 180_000);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (message) => {
    if (message.type() === "error") console.warn(`[navigateur] ${message.text()}`);
  });
  page.on("pageerror", (error) => console.warn(`[navigateur] ${error.message}`));
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
    // The owner lands on « Tableau de bord »: the site status and what is left to do.
    await page
      .getByRole("heading", { name: "Tableau de bord", exact: true })
      .waitFor({ timeout: 60_000 });
    await page.getByRole("heading", { name: "Pour bien démarrer" }).waitFor();
    await page.screenshot({ path: path.join(SCREENSHOTS, "00-home.png") });
    await nav("Pages");
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
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
        const data = (await db.doc("cms_page_content/accueil").get()).data();
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
    // The title is selected: its fields only, the others behind « Tous les champs de la section ».
    await page
      .locator(".of-panel:visible")
      .getByRole("button", { name: "Tous les champs de la section" })
      .click();
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
        const snap = await db.collection("cms_media").get();
        return snap.docs.find((d) => d.data().name === "photo-test.png")?.data();
      },
      30_000,
      "média enregistré",
    );
    expect(media.path).toMatch(/^cms\/media\/.+-photo-test\.png$/);
    // cmsOptimizeMedia (Storage trigger) adds the WebP copies to the library entry. Behind an
    // HTTPS proxy, firebase-tools routes the emulators' internal calls through it and Storage
    // triggers never fire: checked in CI (no proxy), skipped here.
    if (process.env.HTTPS_PROXY || process.env.https_proxy) {
      console.warn(
        "Déclencheurs Storage indisponibles derrière un proxy : optimisation non vérifiée.",
      );
    } else {
      const optimized = await waitFor(
        async () => {
          const snap = await db.collection("cms_media").where("path", "==", media.path).get();
          const data = snap.docs[0]?.data();
          return data?.optimization?.status === "done" ? data : undefined;
        },
        60_000,
        "copies optimisées",
      );
      expect(optimized.variants[0].url).toContain("cms%2Fmedia%2Foptimized%2F");
    }
    await page.getByText("Enregistré", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Retour aux pages" }).click();
  });

  it("styles the title for mobile only, from the Style block below its content", async () => {
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
    const home = page.locator("li", {
      has: page.getByRole("button", { name: "Accueil", exact: true }),
    });
    await home.getByRole("button", { name: "Modifier" }).click();
    const frame = page.frameLocator("#preview-frame");
    const title = frame.locator('h1 [data-of="title"]');
    await title.waitFor({ timeout: 120_000 });
    const box = (await title.boundingBox())!;
    await page.mouse.click(box.x + 10, box.y + box.height / 2);
    // Puck renders the fields panel twice (desktop and mobile layouts): take the visible one.
    const panel = page.locator(".of-panel:visible");
    // The content comes first; the style is closed by default (the browser remembers it).
    const toggle = panel.getByRole("button", { name: /^Style/ });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await panel.locator(".of-style__crumbs .is-current").getByText("Titre").waitFor();
    await panel.getByRole("button", { name: "Mobile", exact: true }).click();
    await panel.getByLabel("Couleur du texte").fill("#ff0000");
    const color = () => title.evaluate((el) => getComputedStyle(el).color);
    await expect.poll(color, { timeout: 10_000 }).toBe("rgb(255, 0, 0)");
    await expect.poll(() => toggle.textContent()).toContain("Mobile · 1 réglage");
    await page.screenshot({ path: path.join(SCREENSHOTS, "02b-style.png") });
    await panel.getByRole("button", { name: "Tous les écrans", exact: true }).click();
    await expect.poll(color, { timeout: 10_000 }).not.toBe("rgb(255, 0, 0)");
    const saved = await waitFor(
      async () => {
        const data = (await db.doc("cms_page_content/accueil").get()).data();
        return data?.data?.content?.[0]?.props?._style?.fields?.title?.mobile?.color;
      },
      30_000,
      "style enregistré dans Firestore",
    );
    expect(saved).toBe("#ff0000");
    await page.getByRole("button", { name: "Retour aux pages" }).click();
  });

  it("changes a theme colour in « Couleurs et polices », with a live preview", async () => {
    await nav("Couleurs et polices");
    // Puck renders the fields panel twice (desktop and mobile layouts): take the visible one.
    const colour = page.getByLabel(/Couleur principale personnalisée/).filter({ visible: true });
    await colour.fill("#123456");
    const preview = page.frameLocator("#preview-frame");
    await expect
      .poll(
        () =>
          preview
            .locator("html")
            .evaluate((el) => getComputedStyle(el).getPropertyValue("--color-brand").trim()),
        { timeout: 30_000 },
      )
      .toBe("#123456");
    const theme = await waitFor(
      async () => {
        const value = (await db.doc("cms_site/settings").get()).data()?.theme?.["color-brand"];
        return value === "#123456" ? value : undefined;
      },
      30_000,
      "thème enregistré",
    );
    expect(theme).toBe("#123456");
    await page.screenshot({ path: path.join(SCREENSHOTS, "04-theme.png") });
    await nav("Pages");
  });

  it("writes a news item in its collection, edited in place like a page", async () => {
    if (!existsSync(path.join(site, "openflow", "seed", "pages", "actualites.json"))) return;
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
    // Items live in their own view, not among the pages.
    expect(
      await page
        .getByRole("list", { name: "Pages du site" })
        .getByText("Nos horaires d'été")
        .count(),
    ).toBe(0);
    await page
      .getByRole("navigation", { name: "Navigation" })
      .getByRole("button", { name: "Actualités", exact: true })
      .click();
    const list = page.getByRole("list", { name: "Actualités" });
    await list.getByText("Nos horaires d'été").waitFor();
    // Newest first.
    expect(await list.locator(".of-list__title").first().innerText()).toBe(
      "Nous ouvrons un second atelier",
    );
    await page.screenshot({ path: path.join(SCREENSHOTS, "07-collection.png") });

    await page.getByRole("button", { name: "Nouvel article" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nouvel article" });
    await dialog.getByLabel("Titre", { exact: true }).fill("Portes ouvertes");
    expect(await dialog.getByLabel("Adresse").inputValue()).toBe("portes-ouvertes");
    await dialog.getByLabel("Date de publication").fill("2026-10-04");
    await dialog.getByRole("button", { name: "Créer et modifier" }).click();

    const frame = page.frameLocator("#preview-frame");
    const heading = frame.locator("h1");
    await heading.waitFor({ timeout: 120_000 });
    expect(await heading.innerText()).toContain("Portes ouvertes");
    const editable = heading.locator("[contenteditable]").first();
    await editable.hover();
    await editable.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(ITEM_TITLE);
    await page.getByText("Enregistré", { exact: true }).waitFor({ timeout: 30_000 });
    await page.screenshot({ path: path.join(SCREENSHOTS, "08-item-editor.png") });
    // The item's title and list values follow what the owner typed on the page.
    const meta = await waitFor(
      async () => {
        const snap = await db
          .collection("cms_pages")
          .where("slug", "==", "actualites/portes-ouvertes")
          .get();
        const data = snap.docs[0]?.data();
        return data?.title === ITEM_TITLE ? data : undefined;
      },
      30_000,
      "titre de l'article enregistré",
    );
    expect(meta.collection).toBe("actualites");
    expect(meta.status).toBe("published");
    expect(meta.summary.title).toBe(ITEM_TITLE);
    expect(meta.summary.date).toBe("2026-10-04");
    expect(meta.summary.body).toBeUndefined();

    await page.getByRole("button", { name: "Retour à « Actualités »" }).click();
    await list.getByText(ITEM_TITLE).waitFor();
    expect(await list.locator(".of-list__title").first().innerText()).toBe(ITEM_TITLE);
    await nav("Pages");
  });

  it("opens a news item from its card in a list section", async () => {
    if (!existsSync(path.join(site, "openflow", "seed", "pages", "actualites.json"))) return;
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
    const home = page.locator("li", {
      has: page.getByRole("button", { name: "Accueil", exact: true }),
    });
    await home.getByRole("button", { name: "Modifier" }).click();
    const frame = page.frameLocator("#preview-frame");
    const card = frame.getByRole("link", { name: "Nous ouvrons un second atelier" });
    await card.waitFor({ timeout: 120_000 });
    await card.scrollIntoViewIfNeeded();
    // Puck's layer covers the section: click where the card is, as the owner does.
    const box = (await card.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const open = page
      .locator(".of-panel:visible")
      .getByRole("button", { name: "Modifier cet élément" });
    await open.click();
    await expect
      .poll(() => frame.locator("h1").innerText(), { timeout: 60_000 })
      .toContain("Nous ouvrons un second atelier");
    await page.getByRole("button", { name: "Retour à « Actualités »" }).click();
    await nav("Pages");
  });

  it("schedules an article: hidden until its time, then online on its own", async () => {
    if (!existsSync(path.join(site, "openflow", "seed", "pages", "actualites.json"))) return;
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
    await page
      .getByRole("navigation", { name: "Navigation" })
      .getByRole("button", { name: "Actualités", exact: true })
      .click();
    await page.getByRole("button", { name: "Nouvel article" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nouvel article" });
    await dialog.getByLabel("Titre", { exact: true }).fill(SCHEDULED_TITLE);
    await dialog.getByRole("radio", { name: /Mise en ligne programmée/ }).check();
    const when = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    when.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    await dialog
      .getByLabel("Date et heure de mise en ligne")
      .fill(`${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T09:00`);
    await dialog.screenshot({ path: path.join(SCREENSHOTS, "18-schedule.png") });
    await page.emulateMedia({ colorScheme: "dark" });
    await dialog.screenshot({ path: path.join(SCREENSHOTS, "18-schedule-dark.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(SCREENSHOTS, "18-schedule-mobile-dark.png") });
    await page.emulateMedia({ colorScheme: "light" });
    await page.screenshot({ path: path.join(SCREENSHOTS, "18-schedule-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await dialog.getByRole("button", { name: "Créer et modifier" }).click();
    await page.frameLocator("#preview-frame").locator("h1").waitFor({ timeout: 120_000 });
    await page.getByRole("button", { name: "Retour à « Actualités »" }).click();
    const row = page
      .getByRole("list", { name: "Actualités" })
      .locator("li", { hasText: SCHEDULED_TITLE });
    await row.getByText(/^Programmé le/).waitFor();
    await page.screenshot({ path: path.join(SCREENSHOTS, "18-schedule-list.png") });
    const doc = (
      await db.collection("cms_pages").where("slug", "==", "actualites/soldes-de-janvier").get()
    ).docs[0]?.data();
    expect(doc).toMatchObject({ status: "draft", publishAt: when.toISOString() });
    await nav("Pages");
  });

  it("fills the business profile: hours and an exceptional closure", async () => {
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
    await nav("Établissement");
    await page.getByRole("heading", { name: "Horaires d'ouverture" }).waitFor();
    if (await page.getByRole("button", { name: "Indiquer les horaires" }).isVisible()) {
      await page.getByRole("button", { name: "Indiquer les horaires" }).click();
    }
    const monday = page.getByRole("checkbox", { name: "Lundi" });
    if (!(await monday.isChecked())) await monday.check();
    await page.getByLabel("Lundi, ouverture").fill("10:00");
    await page.getByLabel("Lundi, fermeture").fill("12:00");
    await page.getByRole("button", { name: "Ajouter une fermeture" }).click();
    const closures = page.getByRole("list", { name: "Fermetures exceptionnelles" });
    await closures.getByLabel("Du", { exact: true }).last().fill("2099-08-10");
    await closures.getByLabel("Au (inclus)").last().fill("2099-08-20");
    await closures.getByLabel("Motif (facultatif)").last().fill("Congés d'été");
    await page.getByText("Lundi : 10 h – 12 h").waitFor();
    await page.screenshot({ path: path.join(SCREENSHOTS, "09-business.png"), fullPage: true });
    await page.getByRole("button", { name: "Enregistrer la fiche" }).click();
    const business = await waitFor(
      async () => {
        const value = (await db.doc("cms_site/settings").get()).data()?.site?.business;
        return value?.hours?.mo?.[0]?.opens === "10:00" ? value : undefined;
      },
      30_000,
      "fiche établissement enregistrée",
    );
    expect(business.closures).toContainEqual({
      from: "2099-08-10",
      to: "2099-08-20",
      label: "Congés d'été",
    });
    await nav("Pages");
  });

  it("fills the legal information, and lists the legal pages written from the site", async () => {
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
    await nav("Informations légales");
    await page.getByRole("heading", { name: "Éditeur du site" }).waitFor();
    await page.getByLabel("Nom ou raison sociale").fill("SARL Boulangerie du Test");
    await page.getByLabel("Immatriculation").fill("RCS Paris 123 456 789");
    await page.getByLabel("Directeur de la publication").fill("Marie Martin");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    const legal = await waitFor(
      async () => {
        const value = (await db.doc("cms_site/settings").get()).data()?.site?.legal;
        return value?.director === "Marie Martin" ? value : undefined;
      },
      30_000,
      "informations légales enregistrées",
    );
    expect(legal).toEqual({
      publisher: "SARL Boulangerie du Test",
      registration: "RCS Paris 123 456 789",
      director: "Marie Martin",
    });
    if (existsSync(path.join(site, "openflow", "seed", "pages", "confidentialite.json"))) {
      const pages = page.locator(".of-legal-pages");
      await pages.getByText("/mentions-legales/").waitFor();
      await pages.getByText("/confidentialite/").waitFor();
      // What the privacy policy says, from the site itself: the contact form is there.
      const forms = page.locator(".of-facts li", { hasText: "Formulaires de contact" });
      await forms.getByText("Oui", { exact: true }).waitFor();
    }
    await page.screenshot({ path: path.join(SCREENSHOTS, "10-legal.png"), fullPage: true });
    // Dark theme, on a phone too (the admin follows the system's appearance).
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: path.join(SCREENSHOTS, "10-legal-dark.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(SCREENSHOTS, "10-legal-mobile-dark.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await nav("Pages");
  });

  it("translates the home page and the common content into English", async () => {
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
    await nav("Langues");
    await page.getByRole("checkbox", { name: "English" }).check();
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await waitFor(
      async () =>
        (await db.doc("cms_site/settings").get()).data()?.site?.locales?.includes("en")
          ? true
          : undefined,
      30_000,
      "anglais ajouté",
    );

    // The menu and the footer: the site's name in English.
    await nav("Menu et pied de page");
    await page.getByRole("combobox", { name: "Langue" }).selectOption("en");
    await page.getByLabel("Nom du site").fill("My business");
    await page.getByRole("button", { name: "Enregistrer la traduction" }).click();
    await waitFor(
      async () =>
        (await db.doc("cms_site/settings").get()).data()?.translations?.en?.site?.name ===
        "My business"
          ? true
          : undefined,
      30_000,
      "contenu commun traduit",
    );

    // The home page: same sections, texts in English.
    await nav("Pages");
    await page.getByRole("button", { name: "Traduire en anglais : Accueil" }).click();
    // Puck renders the panel twice (desktop and mobile layouts): the visible one.
    const panel = page.locator(".of-translate:visible");
    await panel.getByText("Traduction en anglais (English)").waitFor();
    await panel.getByLabel("Titre de la page").fill("Home");
    const first = panel.locator(".of-translate__text").first();
    await first.locator("input, textarea").first().fill("Handmade in our workshop");
    const translation = await waitFor(
      async () => {
        const data = (await db.doc("cms_page_translations/accueil__en").get()).data();
        return data?.title === "Home" &&
          Object.values(data.values ?? {}).includes("Handmade in our workshop")
          ? data
          : undefined;
      },
      30_000,
      "page traduite",
    );
    expect(translation.locale).toBe("en");
    // The structure stays the French one: no sections to add in English.
    await expect.poll(() => page.locator(".of-editor.is-translating").count()).toBe(1);
    await page.screenshot({ path: path.join(SCREENSHOTS, "12-translate.png") });
    await page.getByRole("button", { name: "Retour aux pages" }).click();
    await page
      .getByRole("button", { name: "Version en anglais : Accueil" })
      .waitFor({ timeout: 30_000 });
  });

  it("links Google Search Console: its tag in the settings, the code alone kept", async () => {
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
    await nav("Site et référencement");
    const field = page.getByLabel("Validation Google Search Console");
    await field.fill("<script>");
    await page
      .getByText("Collez le code de validation donné par Search Console (ou la balise entière).")
      .waitFor();
    await field.fill('<meta name="google-site-verification" content="Ab12_cd34-EF56gh78" />');
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await waitFor(
      async () =>
        (await db.doc("cms_site/settings").get()).data()?.site?.verification?.google ===
        "Ab12_cd34-EF56gh78"
          ? true
          : undefined,
      30_000,
      "balise Search Console enregistrée",
    );
    await nav("Pages");
  });

  it("publishes: snapshot, static build, release live", async () => {
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
    await page.getByRole("button", { name: /^Publier/ }).click();
    // The site audit gives advice, without blocking: here the site's address is missing.
    const advice = page.locator("details.of-advice");
    await advice.locator("summary").click();
    await advice
      .getByRole("list", { name: "Conseils" })
      .getByText("L'adresse du site n'est pas renseignée.")
      .waitFor();
    if (existsSync(path.join(site, "openflow", "seed", "pages", "actualites.json"))) {
      // The scheduled article stays hidden: it goes online on its own, at its time.
      await page
        .getByRole("dialog", { name: "Publier le site" })
        .getByText(SCHEDULED_TITLE)
        .waitFor();
    }
    await page.getByRole("button", { name: "Mettre en ligne" }).click();
    const release = await waitFor(
      async () => {
        const snap = await db.collection("cms_releases").get();
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
    // Free style (mobile only) and theme tokens, as in the editor.
    expect(html).toContain('@media (max-width:767.98px){[data-of-s="');
    expect(html).toContain("color:#ff0000");
    expect(html).toContain(":root{--color-brand:#123456}");
    // IndexNow key made at the first publication, served for Bing, Copilot…
    expect(readFileSync(path.join(site, "out", "indexnow.txt"), "utf8")).toMatch(/^[a-f0-9]{32}$/);
    // The business profile: structured data for Google and AI assistants.
    expect(html).toContain('"openingHoursSpecification"');
    // Search Console checks the home page's tag.
    expect(html).toMatch(
      /<meta name="google-site-verification" content="Ab12_cd34-EF56gh78"\s*\/?>/,
    );
    expect(html).toContain('"validFrom":"2099-08-10"');
    // Collections: the new item has its page, is first in the lists, the feed and llms.txt.
    if (existsSync(path.join(site, "openflow", "seed", "pages", "actualites.json"))) {
      const item = readFileSync(
        path.join(site, "out", "actualites", "portes-ouvertes", "index.html"),
        "utf8",
      );
      expect(item).toContain(ITEM_TITLE);
      expect(item).toContain('"@type":"Article"');
      expect(item).toContain('property="og:type" content="article"');
      expect(html.indexOf(ITEM_TITLE)).toBeLessThan(html.indexOf("Nous ouvrons un second atelier"));
      expect(readFileSync(path.join(site, "out", "rss.xml"), "utf8")).toContain(ITEM_TITLE);
      expect(existsSync(path.join(site, "out", "actualites", "soldes-de-janvier"))).toBe(false);
      expect(html).not.toContain(SCHEDULED_TITLE);
      expect(readFileSync(path.join(site, "out", "llms.txt"), "utf8")).toContain("## Actualités");
      // Events: their day, time, place and price for Google and AI assistants.
      const event = readFileSync(
        path.join(site, "out", "evenements", "atelier-decouverte", "index.html"),
        "utf8",
      );
      expect(event).toContain('"@type":"Event"');
      expect(event).toContain('"startDate":"2026-11-14T14:30"');
      expect(event).toContain('"price":35');
    }
    // English: the home page at /en/, in English, with the site's name in English.
    const english = readFileSync(path.join(site, "out", "en", "index.html"), "utf8");
    expect(english).toContain("Handmade in our workshop");
    expect(english).toContain("My business");
    expect(english).toContain('document.documentElement.lang="en"');
    // The language switcher of the French home page.
    expect(html).toMatch(/href="\/en\/"[^>]*hreflang="en"/i);
    // Legal pages, written from the published site and the publisher's details.
    if (existsSync(path.join(site, "openflow", "seed", "pages", "confidentialite.json"))) {
      const notice = readFileSync(path.join(site, "out", "mentions-legales", "index.html"), "utf8");
      expect(notice).toContain("SARL Boulangerie du Test");
      expect(notice).toContain("Directeur de la publication\u00a0: Marie Martin");
      expect(notice).toContain("Google Cloud France SARL");
      const privacy = readFileSync(path.join(site, "out", "confidentialite", "index.html"), "utf8");
      expect(privacy).toContain("Mesure d\u2019audience sans cookie");
      expect(privacy).toContain("Formulaires de contact");
      expect(privacy).toContain("data-of-stats-optout");
      expect(privacy).not.toContain("Google Analytics");
      // Linked from every page (footer).
      expect(html).toContain('href="/confidentialite/"');
    }
    expect(existsSync(path.join(site, "out", "admin", "index.html"))).toBe(true);
    await page
      .getByText("Le site est en ligne avec vos dernières modifications.")
      .waitFor({ timeout: 30_000 });
    await nav("Historique");
    await page.getByText("En ligne", { exact: true }).first().waitFor();
    await page.screenshot({ path: path.join(SCREENSHOTS, "03-history.png") });
  });

  it("receives a visitor's message from the contact form, in « Messages »", async () => {
    if (!existsSync(path.join(site, "openflow", "seed", "pages", "contact.json"))) return;
    const visitor = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await visitor.goto(`http://localhost:${PORT}/contact/`);
      // Declared to the visitor's AI assistant (WebMCP declarative API).
      const form = visitor.locator("form[toolname]");
      expect(await form.getAttribute("toolname")).toMatch(/^send_\w+$/);
      expect(await form.getByLabel(/^E-mail/).getAttribute("toolparamdescription")).toBe("E-mail");
      // Sent empty: the errors are shown next to the fields, and the first one gets the focus.
      await visitor.getByRole("button", { name: "Envoyer le message" }).click();
      await expect
        .poll(() => visitor.evaluate(() => document.activeElement?.getAttribute("name")))
        .toBe("nom");
      expect(await visitor.getByLabel(/^Nom/).getAttribute("aria-invalid")).toBe("true");
      expect(await visitor.getByLabel(/^Nom/).getAttribute("autocomplete")).toBe("name");
      await visitor.getByLabel(/^Nom/).fill("Camille Martin");
      await visitor.getByLabel(/^E-mail/).fill("camille@exemple.fr");
      await visitor.getByLabel(/^Message/).fill("Bonjour,\nPouvez-vous me rappeler ?");
      // People take a few seconds to fill a form; posts faster than that are dropped as bots.
      await visitor.waitForTimeout(3000);
      await visitor.getByRole("button", { name: "Envoyer le message" }).click();
      await visitor.getByRole("status").getByText(/Merci/).waitFor({ timeout: 60_000 });
      await visitor.screenshot({ path: path.join(SCREENSHOTS, "05-contact.png") });
    } finally {
      await visitor.close();
    }
    const message = await waitFor(
      async () => {
        const snap = await db.collection("cms_messages").get();
        return snap.docs[0]?.data();
      },
      30_000,
      "message enregistré",
    );
    expect(message.page).toBe("/contact/");
    expect(message.email).toBe("camille@exemple.fr");
    expect(message.fields).toContainEqual({ label: "Nom", value: "Camille Martin" });
    expect(message.read).toBe(false);

    // A bot (hidden field filled, sent at once) is told « ok » but nothing is recorded.
    const bot = await fetch("http://127.0.0.1:5001/demo-openflow/europe-west1/cmsSubmitForm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formId: "contact-form",
        page: "/contact/",
        values: { nom: "Bot", "e-mail": "bot@exemple.fr", message: "Spam" },
        website: "https://spam.example",
        elapsed: 100,
      }),
    });
    expect(bot.status).toBe(200);

    await page.getByRole("button", { name: /^Messages/ }).click();
    const list = page.getByRole("list", { name: "Messages reçus" });
    await list.getByText("Camille Martin").click();
    const dialog = page.getByRole("dialog", { name: "Message de Camille Martin" });
    await dialog.getByText("Pouvez-vous me rappeler ?").waitFor();
    expect(await dialog.getByRole("link", { name: "Répondre" }).getAttribute("href")).toMatch(
      /^mailto:camille@exemple\.fr/,
    );
    await page.screenshot({ path: path.join(SCREENSHOTS, "06-messages.png") });
    await waitFor(
      async () => {
        const snap = await db.collection("cms_messages").get();
        return snap.docs[0]?.data().read === true ? true : undefined;
      },
      30_000,
      "message lu",
    );
    expect((await db.collection("cms_messages").get()).size).toBe(1);
    await dialog.getByRole("button", { name: "Fermer" }).click();
  });

  it("books an appointment on the site, seen and cancelled in « Rendez-vous »", async () => {
    if (!existsSync(path.join(site, "openflow", "seed", "pages", "rendez-vous.json"))) return;
    const visitor = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let slot: { date: string; time: string } | undefined;
    try {
      await visitor.goto(`http://localhost:${PORT}/rendez-vous/`);
      // Services, then the days and times computed from the opening hours.
      // The service cards are labels around a visually hidden radio: click the card.
      await visitor.locator("label", { hasText: "Rendez-vous conseil" }).click();
      expect(await visitor.getByRole("radio", { name: /Rendez-vous conseil/ }).isChecked()).toBe(
        true,
      );
      const times = visitor.locator("button[aria-pressed]", { hasText: /^\d{1,2}\sh/ });
      await times.first().waitFor({ timeout: 60_000 });
      await times.first().click();
      await visitor.getByText(/^Votre rendez-vous/).waitFor();
      await visitor.screenshot({ path: path.join(SCREENSHOTS, "19-booking.png"), fullPage: true });
      await visitor.getByLabel(/^Nom/).fill("Camille Martin");
      await visitor.getByLabel(/^E-mail/).fill("camille@exemple.fr");
      await visitor.getByLabel(/^Téléphone/).fill("06 12 34 56 78");
      await visitor.waitForTimeout(3000);
      await visitor.getByRole("button", { name: "Réserver ce créneau" }).click();
      await visitor
        .getByRole("status")
        .getByText(/C'est réservé/)
        .waitFor({ timeout: 60_000 });
      await visitor.getByRole("button", { name: "Ajouter à mon agenda" }).waitFor();
      await visitor.screenshot({ path: path.join(SCREENSHOTS, "19-booking-done.png") });
      const booking = await waitFor(
        async () => (await db.collection("cms_bookings").get()).docs[0]?.data(),
        30_000,
        "rendez-vous enregistré",
      );
      expect(booking).toMatchObject({
        service: "Rendez-vous conseil",
        duration: 60,
        name: "Camille Martin",
        email: "camille@exemple.fr",
        status: "confirmed",
        timeZone: "Europe/Paris",
      });
      slot = { date: booking.date, time: booking.time };
      // The same time again: taken.
      const again = await fetch("http://127.0.0.1:5001/demo-openflow/europe-west1/cmsBooking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "/rendez-vous/",
          sectionId: "booking-rendez-vous",
          service: 1,
          ...slot,
          values: { name: "Autre", email: "autre@exemple.fr" },
          elapsed: 5000,
        }),
      });
      expect(again.status).toBe(409);
      // The times taken are public, without names.
      const busy = await (
        await fetch(
          `http://127.0.0.1:5001/demo-openflow/europe-west1/cmsBooking?from=${slot.date}&days=1`,
        )
      ).json();
      expect(busy.busy).toHaveLength(1);
      expect(JSON.stringify(busy)).not.toContain("Camille");
    } finally {
      await visitor.close();
    }

    await nav("Rendez-vous");
    const row = page.locator(".of-booking", { hasText: "Camille Martin" });
    await row.getByText("Rendez-vous conseil").waitFor();
    await page.screenshot({ path: path.join(SCREENSHOTS, "20-bookings.png") });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: path.join(SCREENSHOTS, "20-bookings-dark.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(SCREENSHOTS, "20-bookings-mobile-dark.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await row.getByRole("button", { name: /^Plus d'actions/ }).click();
    await page.getByRole("menuitem", { name: "Annuler le rendez-vous" }).click();
    await page
      .getByRole("dialog", { name: "Annuler ce rendez-vous ?" })
      .getByRole("button", { name: "Annuler le rendez-vous" })
      .click();
    await waitFor(
      async () => {
        const [booking] = (await db.collection("cms_bookings").get()).docs;
        const day = await db.doc(`cms_booking_days/${slot?.date}`).get();
        return booking?.data().status === "cancelled" && day.data()?.busy?.length === 0
          ? true
          : undefined;
      },
      30_000,
      "rendez-vous annulé",
    );
    await nav("Pages");
  });

  it("counts visits without cookies, the AI assistant named, in « Statistiques »", async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    });
    // Automated browsers are not counted (navigator.webdriver): this one plays a visitor.
    await context.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }),
    );
    const visitor = await context.newPage();
    try {
      // A link from ChatGPT's answer (it adds utm_source).
      await visitor.goto(`http://localhost:${PORT}/?utm_source=chatgpt.com`);
      await waitFor(
        async () => ((await statsTotal()).views >= 1 ? true : undefined),
        30_000,
        "première page vue comptée",
      );
      // A link followed on the site (the referrer is the site itself: same visit).
      await visitor.evaluate(() => {
        window.location.href = "/actualites/";
      });
      await visitor.waitForURL(/\/actualites\/$/);
      await waitFor(
        async () => ((await statsTotal()).views >= 2 ? true : undefined),
        60_000,
        "deuxième page vue comptée",
      );
      // Leaving the first page sent its speed (Core Web Vitals), not counted as a view.
      await waitFor(
        async () => (((await statsTotal()).vitals.lcp ?? 0) >= 1 ? true : undefined),
        30_000,
        "vitesse de la première page mesurée",
      );
      // Nothing is stored in the visitor's browser.
      expect(await context.cookies()).toEqual([]);
    } finally {
      await context.close();
    }
    const total = await statsTotal();
    expect(total).toMatchObject({ views: 2, visits: 1 });
    expect(total.sources).toEqual({ chatgpt: 1 });
    expect(total.devices).toEqual({ mobile: 1 });
    expect(total.aiPages).toEqual({ "/": 1 });
    expect(total.pages).toEqual({ "/": 1, "/actualites/": 1 });

    await nav("Statistiques");
    await page.getByRole("heading", { name: "Statistiques" }).waitFor();
    const ai = page.locator(".of-stat", { hasText: "Depuis un assistant IA" });
    await expect.poll(() => ai.textContent()).toContain("100 % des visites");
    await page.getByRole("list", { name: "Sources des visites" }).getByText("ChatGPT").waitFor();
    await page
      .getByRole("list", { name: "Pages où arrivent les assistants IA" })
      .getByText("Accueil")
      .waitFor();
    await page.getByRole("list", { name: "Vitesse ressentie" }).getByText("Affichage").waitFor();
    // The chart reads with the keyboard: today is the last column.
    const chart = page.getByRole("slider", { name: "Visites par jour" });
    await chart.focus();
    await chart.press("End");
    expect(await chart.getAttribute("aria-valuetext")).toMatch(
      /1 visite, 1 depuis un assistant IA, 2 pages vues$/,
    );
    await page.screenshot({ path: path.join(SCREENSHOTS, "07-stats.png") });
    // Google Search Console: until the site's account is added, how to link it.
    const search = page.getByRole("region", { name: "Recherche Google" });
    await search.getByText(/À faire une fois/).waitFor();
    await search.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SCREENSHOTS, "21-search-console.png") });
  });

  it("lets a visitor stop the counting from the privacy policy", async () => {
    if (!existsSync(path.join(site, "openflow", "seed", "pages", "confidentialite.json"))) return;
    // A real phone (the default agent, HeadlessChrome, is left out as a robot).
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    });
    await context.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }),
    );
    const visitor = await context.newPage();
    visitor.on("pageerror", (error) => console.warn(`[visiteur] ${error.message}`));
    visitor.on("console", (message) => {
      if (message.type() === "error") console.warn(`[visiteur] ${message.text()}`);
    });
    try {
      await visitor.goto(`http://localhost:${PORT}/confidentialite/`);
      const before = await waitFor(
        async () => {
          const total = await statsTotal();
          return total.pages["/confidentialite/"] ? total.views : undefined;
        },
        30_000,
        "page de confidentialité comptée",
      );
      const status = visitor.getByRole("status").filter({ hasText: "Vos visites" });
      await status.getByText("Vos visites sont comptées de façon anonyme.").waitFor();
      await visitor.getByRole("button", { name: "Ne plus compter mes visites" }).click();
      await status.getByText("Vos visites ne sont plus comptées sur cet appareil.").waitFor();
      await visitor.getByRole("button", { name: "Compter à nouveau mes visites" }).waitFor();
      expect(await visitor.evaluate(() => localStorage.getItem("cms-stats-optout"))).toBe("1");
      await visitor.screenshot({
        path: path.join(SCREENSHOTS, "11-privacy-mobile.png"),
        fullPage: true,
      });
      // The next pages are not counted.
      await visitor.goto(`http://localhost:${PORT}/contact/`);
      await visitor.waitForLoadState("networkidle");
      await new Promise((resolve) => setTimeout(resolve, 3000));
      expect((await statsTotal()).views).toBe(before);
      // Still no cookie.
      expect(await context.cookies()).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it("edits global settings (site name)", async () => {
    await nav("Site et référencement");
    await page.getByLabel("Nom du site").fill("Boulangerie du Test");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    const name = await waitFor(
      async () => {
        const value = (await db.doc("cms_site/settings").get()).data()?.site?.name;
        return value === "Boulangerie du Test" ? value : undefined;
      },
      30_000,
      "nom du site enregistré",
    );
    expect(name).toBe("Boulangerie du Test");
  });
});
