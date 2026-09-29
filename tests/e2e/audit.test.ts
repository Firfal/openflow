// UX audit of the admin: every screen and editor state at four widths, light and dark, with the
// measures of the admin-ui skill's « Auditer » section (canvas scale, type sizes, off-grid spacing,
// small targets, header height, axe violations, console errors).
//   CMS_AUDIT_TAG=before pnpm --filter @openflow/e2e ux-audit
//   node tests/e2e/audit-compare.mjs before after
// Output: tests/e2e/screenshots/audit/<tag>/ (screenshots and metrics.json; ignored by git).
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const site =
  process.env.CMS_E2E_SITE ?? path.resolve(import.meta.dirname, "../../templates/next-starter");
const PORT = 3104;
const ADMIN = `http://localhost:${PORT}/admin/`;
const OWNER = "proprietaire@exemple.fr";
const TAG = process.env.CMS_AUDIT_TAG ?? "latest";
const OUT = path.join(import.meta.dirname, "screenshots", "audit", TAG);
const WIDTHS = [1440, 1366, 1280, 390];
const HIDE_DEV = "nextjs-portal { display: none !important; }";

/** Dashboard views, by address (views that do not exist yet are skipped). */
const VIEWS: Array<[string, string]> = [
  ["home", "?view=home"],
  ["pages", "?view=pages"],
  ["collection", "?view=collection&c=actualites"],
  ["media", "?view=media"],
  ["messages", "?view=messages"],
  ["bookings", "?view=bookings"],
  ["stats", "?view=stats"],
  ["history", "?view=history"],
  ["assistant", "?view=assistant"],
  ["settings-global", "?view=settings&tab=global"],
  ["settings-theme", "?view=settings&tab=theme"],
  ["settings-site", "?view=settings&tab=site"],
  ["settings-languages", "?view=settings&tab=languages"],
  ["settings-business", "?view=settings&tab=business"],
  ["settings-legal", "?view=settings&tab=legal"],
];

interface Metrics {
  canvasScale: number | null;
  headHeight: number | null;
  publishTop: number | null;
  fontSizes: string[];
  fontWeights: string[];
  offGrid: number;
  smallTargets: string[];
  buttons: number;
  axe?: string[];
  consoleErrors: number;
}

let server: ChildProcess;
let browser: Browser;
let page: Page;
const app = initializeApp({ projectId: "demo-openflow" }, "audit");
const results: Record<string, Metrics> = {};
let consoleErrors = 0;

/** What the owner sees, measured in the admin document (the site's iframe is left out). */
function measure(): Omit<Metrics, "axe" | "consoleErrors"> {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const root = document.querySelector(".of-root") ?? document.body;
  const all = [...root.querySelectorAll("*")].filter(visible);
  const sizes = new Set<string>();
  const weights = new Set<string>();
  for (const el of all) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) continue;
    const s = getComputedStyle(el);
    sizes.add(s.fontSize);
    weights.add(s.fontWeight);
  }
  let offGrid = 0;
  for (const el of all) {
    const s = getComputedStyle(el);
    for (const v of [
      s.paddingTop,
      s.paddingRight,
      s.paddingBottom,
      s.paddingLeft,
      s.marginTop,
      s.marginBottom,
      s.rowGap,
      s.columnGap,
    ]) {
      const n = Number.parseFloat(v);
      if (n > 2 && Math.abs(n % 4) > 0.01) offGrid++;
    }
  }
  const interactive = [
    ...root.querySelectorAll(
      "button, a[href], select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), [role=button], [role=tab], [role=menuitem]",
    ),
  ].filter(visible);
  const smallTargets = interactive
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width < 24 || r.height < 24;
    })
    .map(
      (el) =>
        el.getAttribute("aria-label") ||
        el.textContent?.trim().slice(0, 30) ||
        el.getAttribute("class") ||
        el.tagName,
    );
  const head = document.querySelector(".of-pagehead, .of-ebar");
  const publish = [...document.querySelectorAll("button")].find(
    (b) => visible(b) && /^Publier/.test(b.textContent?.trim() ?? ""),
  );
  const frame = document.querySelector<HTMLIFrameElement>("#preview-frame");
  let canvasScale: number | null = null;
  if (frame?.contentWindow) {
    const r = frame.getBoundingClientRect();
    canvasScale = Math.round((r.width / frame.contentWindow.innerWidth) * 100) / 100;
  }
  return {
    canvasScale,
    headHeight: head ? Math.round(head.getBoundingClientRect().height) : null,
    publishTop: publish ? Math.round(publish.getBoundingClientRect().top) : null,
    fontSizes: [...sizes].sort(),
    fontWeights: [...weights].sort(),
    offGrid,
    smallTargets,
    buttons: interactive.filter((el) => el.tagName === "BUTTON").length,
  };
}

/** Lets animations and colour transitions end, then captures and measures the screen. */
async function capture(name: string, width: number, theme: "light" | "dark") {
  await page.waitForTimeout(700);
  const key = `${name}@${width}-${theme}`;
  const before = consoleErrors;
  await page.screenshot({ path: path.join(OUT, `${key}.png`) });
  const metrics: Metrics = { ...(await page.evaluate(measure)), consoleErrors: 0 };
  if (theme === "light" && (width === 1440 || width === 390)) {
    const axe = await new AxeBuilder({ page })
      .exclude("#preview-frame")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    metrics.axe = axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} (${v.nodes.length})`);
  }
  metrics.consoleErrors = consoleErrors - before;
  results[key] = metrics;
  // Written after each capture: a failure later on keeps what was measured.
  writeFileSync(path.join(OUT, "metrics.json"), `${JSON.stringify(results, null, 2)}\n`);
}

/** A step that may not exist on this screen (no « Ajouter » rail on a phone…): noted, then skipped. */
async function attempt(name: string, step: () => Promise<void>) {
  try {
    await step();
  } catch (error) {
    console.warn(`Audit : étape « ${name} » ignorée (${(error as Error).message.split("\n")[0]})`);
    await page.keyboard.press("Escape").catch(() => undefined);
  }
}

/** In-app navigation (the admin's router listens to popstate), without reloading the page. */
async function go(search: string) {
  await page.evaluate((s) => {
    window.history.pushState(null, "", s);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `${ADMIN}${search}`);
}

async function ready() {
  await page
    .locator(".of-pagehead h1, .of-ebar")
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1200);
}

async function fixtures() {
  const db = getFirestore(app);
  const now = new Date();
  const day = (offset: number) => {
    const d = new Date(now.getTime() + offset * 86_400_000);
    return d.toISOString().slice(0, 10);
  };
  for (const [id, name, text, read] of [
    ["audit-1", "Camille Martin", "Bonjour, pouvez-vous me rappeler pour un devis ?", false],
    ["audit-2", "Louis Bernard", "Merci pour votre accueil samedi dernier !", true],
  ] as const) {
    await db
      .collection("cms_messages")
      .doc(id)
      .set({
        formId: "contact",
        page: "/contact/",
        formTitle: "Contact",
        fields: [
          { label: "Nom", value: name },
          { label: "Message", value: text },
        ],
        email: `${name.split(" ")[0]?.toLowerCase()}@exemple.fr`,
        createdAt: now.toISOString(),
        read,
      });
  }
  for (const [id, offset, name] of [
    ["audit-b1", 1, "Camille Martin"],
    ["audit-b2", 3, "Jeanne Petit"],
  ] as const) {
    await db
      .collection("cms_bookings")
      .doc(id)
      .set({
        page: "/rendez-vous/",
        sectionId: "audit",
        service: "Rendez-vous conseil",
        duration: 60,
        price: "60 €",
        start: `${day(offset)}T08:00:00.000Z`,
        end: `${day(offset)}T09:00:00.000Z`,
        date: day(offset),
        time: "10:00",
        timeZone: "Europe/Paris",
        name,
        email: "client@exemple.fr",
        status: "confirmed",
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 365 * 86_400_000),
      });
  }
}

beforeAll(async () => {
  if (!process.env.CMS_AUDIT) return;
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const seed = spawnSync(
    path.join(site, "node_modules", ".bin", "openflow"),
    ["seed", "--emulator", "--force"],
    { cwd: site, stdio: "inherit" },
  );
  expect(seed.status).toBe(0);
  await fixtures();
  server = spawn(path.join(site, "node_modules", ".bin", "next"), ["dev", "--port", String(PORT)], {
    cwd: site,
    stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_CMS_EMULATORS: "1", NEXT_TELEMETRY_DISABLED: "1" },
  });
  for (let i = 0; i < 180; i++) {
    const ok = await fetch(ADMIN)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  browser = await chromium.launch();
  // A context of its own: axe-core needs one (not the browser's default page).
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors++;
  });
  page.on("pageerror", () => consoleErrors++);
});

afterAll(async () => {
  await browser?.close();
  server?.kill("SIGINT");
  await deleteApp(app);
});

describe.runIf(process.env.CMS_AUDIT)("audit UX de l'admin", () => {
  it("captures and measures every screen", async () => {
    await page.goto(ADMIN);
    await page.addStyleTag({ content: HIDE_DEV });
    await page.getByLabel("Votre adresse e-mail").fill(OWNER, { timeout: 120_000 });
    await page.getByRole("button", { name: "Connexion rapide (émulateur local)" }).click();
    await page.getByRole("navigation", { name: "Navigation" }).waitFor({ timeout: 120_000 });
    const known = new Set<string>();

    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
        // An unknown address falls back to another view: skip the views showing a screen already seen.
        const seen = new Set<string>();
        for (const [name, search] of VIEWS) {
          await go(search);
          await ready();
          const signature = await page.evaluate(
            () =>
              `${document.querySelector(".of-pagehead h1, .of-ebar")?.textContent?.trim().slice(0, 60)}|${document.querySelector("[aria-current=page]")?.textContent?.trim()}`,
          );
          if (seen.has(signature)) continue;
          seen.add(signature);
          known.add(name);
          await capture(name, width, theme);
        }

        // Dialogs over the pages list.
        await go("?view=pages");
        await ready();
        const publish = page.getByRole("button", { name: /^Publier/ }).first();
        await attempt("publier", async () => {
          await publish.click({ timeout: 10_000 });
          await page.getByRole("dialog").waitFor({ timeout: 30_000 });
          await capture("dialog-publish", width, theme);
          await page.keyboard.press("Escape");
        });
        await attempt("paramètres de page", async () => {
          await page
            .getByRole("button", { name: /^Plus d'actions/ })
            .first()
            .click({ timeout: 10_000 });
          await page.getByRole("menuitem", { name: /^Paramètres/ }).click({ timeout: 10_000 });
          await page.getByRole("dialog").waitFor({ timeout: 10_000 });
          await capture("dialog-page-settings", width, theme);
          await page.keyboard.press("Escape");
        });
        await attempt("palette", async () => {
          await page.keyboard.press("Control+k");
          await page.getByRole("dialog").waitFor({ timeout: 5_000 });
          await capture("dialog-palette", width, theme);
          await page.keyboard.press("Escape");
        });

        // Editor states.
        await go("?view=editor&page=accueil");
        const frame = page.frameLocator("#preview-frame");
        await frame.locator("h1").first().waitFor({ timeout: 120_000 });
        await page.waitForTimeout(1500);
        await capture("editor-open", width, theme);
        await attempt("texte", async () => {
          await frame.locator("h1").first().click({ timeout: 10_000 });
          await capture("editor-text", width, theme);
        });
        await attempt("élément de liste", async () => {
          await frame.locator("[data-of-i]").first().click({ timeout: 10_000 });
          await capture("editor-list-item", width, theme);
        });
        await attempt("style", async () => {
          const style = page.getByRole("button", { name: /^Style/ }).first();
          const open = (await style.getAttribute("aria-expanded", { timeout: 5_000 })) === "true";
          if (!open) await style.click();
          await capture("editor-style", width, theme);
          if (!open) await style.click();
        });
        await attempt("ajouter", async () => {
          if (!(await page.locator(".of-drawer-item").first().isVisible())) {
            await page
              .getByRole("button", { name: "Ajouter", exact: true })
              .first()
              .click({ timeout: 5_000 });
          }
          await capture("editor-add", width, theme);
        });
        await attempt("en-tête", async () => {
          await frame
            .locator("header")
            .first()
            .click({ position: { x: 10, y: 10 }, timeout: 10_000 });
          await capture("editor-header", width, theme);
        });
        await go("?view=pages");
        await ready();
      }
    }

    writeFileSync(path.join(OUT, "metrics.json"), `${JSON.stringify(results, null, 2)}\n`);
    console.log(`Audit : ${Object.keys(results).length} captures dans ${OUT}`);
    expect(known.size).toBeGreaterThan(5);
  }, 3_600_000);
});
