import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { type Browser, chromium, type FrameLocator, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Editor ergonomics on the emulators, for any OpenFlow site (template by default,
// OPENFLOW_E2E_SITE=sites/landing for the landing): adding and reordering sections with the mouse,
// collapsed content opened while editing, the site frame around the page, and media replaced
// from the page.
const site =
  process.env.OPENFLOW_E2E_SITE ??
  path.resolve(import.meta.dirname, "../../templates/next-starter");
const PORT = 3101;
const ADMIN = `http://localhost:${PORT}/admin/`;
const OWNER = "proprietaire@exemple.fr";

let server: ChildProcess;
let browser: Browser;
let page: Page;
let frame: FrameLocator;

async function waitForHttp(url: string, timeoutMs: number) {
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

// Order of the sections as the owner sees it (dnd-kit briefly keeps an invisible copy of a
// dragged element: hidden and duplicate entries are ignored).
const sections = () =>
  frame.locator("[data-puck-component]").evaluateAll((els) => {
    const ids: string[] = [];
    for (const el of els) {
      const id = el.getAttribute("data-puck-component") ?? "";
      const visible =
        el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden";
      if (visible && !ids.includes(id)) ids.push(id);
    }
    return ids;
  });

async function center(locator: { boundingBox: () => Promise<any> }) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("élément invisible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

beforeAll(async () => {
  const seed = spawnSync(
    path.join(site, "node_modules", ".bin", "openflow"),
    ["seed", "--emulator", "--force"],
    { cwd: site, stdio: "inherit" },
  );
  expect(seed.status).toBe(0);
  server = spawn(path.join(site, "node_modules", ".bin", "next"), ["dev", "--port", String(PORT)], {
    cwd: site,
    stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_OPENFLOW_EMULATORS: "1", NEXT_TELEMETRY_DISABLED: "1" },
  });
  await waitForHttp(ADMIN, 180_000);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ADMIN);
  await page.getByLabel("Votre adresse e-mail").fill(OWNER);
  await page.getByRole("button", { name: "Connexion rapide (émulateur local)" }).click();
  await page.getByRole("heading", { name: "Pages", exact: true }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Modifier" }).first().click();
  frame = page.frameLocator("#preview-frame");
  await frame.locator("[data-puck-component]").first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
});

afterAll(async () => {
  await browser?.close();
  server?.kill("SIGINT");
});

describe("éditeur de page", () => {
  it("adds a section by dragging it from the library onto the page", async () => {
    const before = (await sections()).length;
    const items = page.locator(".of-drawer-item");
    let index = (await items.count()) - 1;
    while (index > 0 && ((await items.nth(index).boundingBox())?.y ?? 9999) > 820) index--;
    const from = await center(items.nth(index));
    const to = await center(page.locator("#preview-frame"));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(to.x, to.y, { steps: 25 });
    await page.mouse.move(to.x, to.y + 10, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await sections()).length, { timeout: 10_000 }).toBe(before + 1);
  });

  it("adds a section with a click on the library item", async () => {
    const before = (await sections()).length;
    const plus = page.locator(".of-drawer-item__plus").first();
    const { x, y } = await center(plus);
    await page.mouse.click(x, y);
    await expect.poll(async () => (await sections()).length, { timeout: 10_000 }).toBe(before + 1);
  });

  it("reorders sections by dragging them on the page", async () => {
    const ids = await sections();
    const canvas = (await page.locator("#preview-frame").boundingBox())!;
    // Two neighbours whose tops are visible in the canvas: drag the second above the first.
    let pair: [any, any] | undefined;
    for (let i = 0; i < ids.length - 1 && !pair; i++) {
      const a = frame.locator(`[data-puck-component="${ids[i]}"]`).first();
      await a.scrollIntoViewIfNeeded();
      const boxA = (await a.boundingBox())!;
      const boxB = (await frame
        .locator(`[data-puck-component="${ids[i + 1]}"]`)
        .first()
        .boundingBox())!;
      // The site header is sticky in the canvas: drop below it, in the upper half of A.
      const dropY = Math.max(boxA.y + 12, canvas.y + 60);
      const fits = dropY < boxA.y + boxA.height / 2 && boxB.y + 60 <= canvas.y + canvas.height;
      if (boxA.y >= canvas.y && fits) pair = [{ ...boxA, dropY }, boxB];
    }
    expect(pair).toBeDefined();
    const [to, from] = pair!;
    await page.mouse.move(from.x + from.width / 2, from.y + 30);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.move(to.x + to.width / 2, to.dropY, { steps: 25 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await expect
      .poll(async () => (await sections()).join(), { timeout: 10_000 })
      .not.toBe(ids.join());
  });

  it("moves the selected section with the arrows of its action bar", async () => {
    const ids = await sections();
    const { box } = await center(frame.locator(`[data-puck-component="${ids[1]}"]`).first());
    await page.mouse.click(box.x + 30, box.y + 30);
    await page.waitForTimeout(500);
    // Hovered sections also render an (invisible, inert) action bar: target the selected one.
    const selected = frame.locator("[class*='DraggableComponent--isSelected']");
    await selected.getByRole("button", { name: "Descendre" }).click();
    // Exactly two neighbours swapped…
    await expect
      .poll(
        async () => {
          const now = await sections();
          const k = now.findIndex((id, i) => id !== ids[i]);
          return (
            k >= 0 && now[k] === ids[k + 1] && now[k + 1] === ids[k] && now.length === ids.length
          );
        },
        { timeout: 10_000 },
      )
      .toBe(true);
    // …and "Monter" puts the moved section back.
    await selected.getByRole("button", { name: "Monter" }).click();
    await expect.poll(async () => (await sections()).join(), { timeout: 10_000 }).toBe(ids.join());
  });

  it("selects the field of a clicked text and edits it from the panel", async () => {
    // A text inside a list (e.g. a FAQ answer): marked `data-of="items.answer"`, `data-of-i`. Some
    // sections keep list texts out of view at this screen size (the landing's hero demo): skip them.
    const marked = frame
      .locator("[data-puck-component] span[data-of*='.'][data-of-i]")
      .filter({ visible: true })
      .first();
    await marked.scrollIntoViewIfNeeded();
    const { x, y } = await center(marked);
    await page.mouse.click(x, y);
    // Puck renders the fields panel twice (desktop and mobile layouts): take the visible one.
    const card = page.locator(".of-selected:visible");
    await card.waitFor({ timeout: 10_000 });
    expect(await card.locator(".of-selected__label").innerText()).toMatch(/n° \d/);
    const input = card.locator("input, textarea").first();
    await input.fill("Texte modifié depuis le panneau");
    await expect
      .poll(async () => (await marked.innerText()).trim(), { timeout: 10_000 })
      .toBe("Texte modifié depuis le panneau");
  });

  it("opens collapsed content (<details>) so it can be edited in place", async () => {
    const details = frame.locator("[data-puck-component] details");
    if ((await details.count()) === 0) return;
    await expect
      .poll(async () =>
        details.evaluateAll((els) => els.every((el) => (el as HTMLDetailsElement).open)),
      )
      .toBe(true);
  });

  it("shows the site frame (header, footer) around the page, without navigating", async () => {
    const header = frame.locator("header").first();
    await header.waitFor();
    const link = header.locator("a").first();
    await link.click({ force: true });
    await page.getByText("modifiez-les dans Réglages").waitFor({ timeout: 5_000 });
    expect(await frame.locator("[data-puck-component]").count()).toBeGreaterThan(0);
  });

  it("replaces an image by tapping it on the page and picking a file of the site", async () => {
    const image = frame.locator("[data-puck-component] img[data-of]").first();
    await image.scrollIntoViewIfNeeded();
    const before = await image.getAttribute("src");
    const { x, y } = await center(image);
    await page.mouse.click(x, y);
    const dialog = page.locator("dialog.of-dialog[open]");
    await dialog.waitFor({ timeout: 10_000 });
    // Registered by `openflow seed`: the images shipped in public/.
    await dialog.getByRole("button", { name: "Fichiers du site" }).click();
    const items = dialog.locator(".of-media-grid__item img");
    await expect.poll(() => items.count(), { timeout: 10_000 }).toBeGreaterThan(1);
    const sources = await items.evaluateAll((els) => els.map((el) => el.getAttribute("src")));
    const pick = sources.findIndex((src) => src !== before);
    await items.nth(pick).click();
    await expect.poll(() => image.getAttribute("src"), { timeout: 10_000 }).toBe(sources[pick]);
    expect(await dialog.count()).toBe(0);
  });

  it("switches a visual to a video and replaces it from its placeholder", async () => {
    // Sites whose hero offers a « Vidéo » visual (the landing).
    const hero = frame.locator("[data-puck-component]:has(h1)").first();
    await hero.scrollIntoViewIfNeeded();
    const { box } = await center(hero);
    await page.mouse.click(box.x + 20, box.y + 20);
    await page.waitForTimeout(500);
    const option = page.locator("label:visible", { hasText: /^Vidéo$/ });
    if (path.basename(site) === "landing") expect(await option.count()).toBeGreaterThan(0);
    if ((await option.count()) === 0) return;
    await option.first().click();
    const video = hero.locator("video[data-of]");
    await video.waitFor({ timeout: 10_000 });
    const tap = await center(video);
    await page.mouse.click(tap.x, tap.y);
    const dialog = page.locator("dialog.of-dialog[open]");
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "Importer une vidéo" }).waitFor();
    await dialog.getByRole("button", { name: "Fermer" }).click();
    await page
      .locator("label:visible", { hasText: /^Démo animée/ })
      .first()
      .click();
    await expect.poll(() => video.count(), { timeout: 10_000 }).toBe(0);
  });
});
