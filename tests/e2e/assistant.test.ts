import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// AI assistant of the starter site on the emulators: a key created in the admin, the MCP server
// (Cloud Function) driven over HTTP like Claude would, changes shown live in the editor,
// revocation, and the same tools exposed to the browser with WebMCP.
const site =
  process.env.OPENFLOW_E2E_SITE ??
  path.resolve(import.meta.dirname, "../../templates/next-starter");
const PORT = 3102;
const ADMIN = `http://localhost:${PORT}/admin/`;
const OWNER = "proprietaire@exemple.fr";
const MCP = "http://127.0.0.1:5001/demo-openflow/europe-west1/openflowMcp";
const SCREENSHOTS = path.join(import.meta.dirname, "screenshots");

let server: ChildProcess;
let browser: Browser;
let page: Page;
let db: Firestore;
let key = "";
let requestId = 0;
const app = initializeApp({ projectId: "demo-openflow" }, "e2e-assistant");

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

async function mcp(method: string, params?: object, token = key) {
  const response = await fetch(MCP, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as any };
}

async function tool(name: string, args: object) {
  const { body } = await mcp("tools/call", { name, arguments: args });
  if (body?.result?.isError) throw new Error(body.result.content[0].text);
  return body.result.structuredContent;
}

beforeAll(async () => {
  db = getFirestore(app);
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
  // WebMCP as a browser would expose it: the admin registers its tools here.
  await page.addInitScript(() => {
    const tools: Record<string, any> = {};
    (window as any).__webmcpTools = tools;
    (navigator as any).modelContext = {
      registerTool: (tool: any, options?: { signal?: AbortSignal }) => {
        tools[tool.name] = tool;
        options?.signal?.addEventListener("abort", () => delete tools[tool.name]);
        return Promise.resolve();
      },
    };
  });
  await page.goto(ADMIN);
  await page.getByLabel("Votre adresse e-mail").fill(OWNER);
  await page.getByRole("button", { name: "Connexion rapide (émulateur local)" }).click();
  await page.getByRole("heading", { name: "Pages", exact: true }).waitFor({ timeout: 60_000 });
});

afterAll(async () => {
  await browser?.close();
  server?.kill("SIGINT");
  await deleteApp(app);
});

describe("assistant IA (MCP et WebMCP)", () => {
  it("creates an access key in Réglages > Assistant IA", async () => {
    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("button", { name: "Assistant IA" }).click();
    await page.getByLabel("Nom de la clé").fill("Claude e2e");
    await page.getByRole("button", { name: "Créer une clé" }).click();
    const value = page.locator(".of-key-created .of-copy__value").first();
    await value.waitFor({ timeout: 30_000 });
    key = (await value.innerText()).trim();
    expect(key).toMatch(/^ofk_[\w-]{40,}$/);
    await page.screenshot({ path: path.join(SCREENSHOTS, "05-assistant.png") });
    await page.getByRole("button", { name: "J'ai copié la clé" }).click();
    await page.getByText("Claude e2e").waitFor();
    // Only the hash is stored.
    const stored = (await db.collection("of_agent_tokens").get()).docs.map((d) => d.data());
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(key);
  });

  it("refuses MCP requests without a valid key", async () => {
    expect((await mcp("tools/list", {}, "")).status).toBe(401);
    expect((await mcp("tools/list", {}, "ofk_wrong")).status).toBe(401);
  });

  it("speaks MCP: initialize, tools/list, tools/call", async () => {
    const init = await mcp("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "e2e", version: "1" },
    });
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe("openflow");
    const list = await mcp("tools/list");
    expect(list.body.result.tools.map((t: any) => t.name)).toContain("update_section");
    const overview = await tool("get_site_overview", {});
    expect(overview.pages.map((p: any) => p.path)).toContain("/");
  });

  it("edits the open page live through the MCP server", async () => {
    await page.getByRole("button", { name: "Pages", exact: true }).click();
    const home = page.locator("li", {
      has: page.getByRole("button", { name: "Accueil", exact: true }),
    });
    await home.getByRole("button", { name: "Modifier" }).click();
    const frame = page.frameLocator("#preview-frame");
    await frame.locator("h1").waitFor({ timeout: 120_000 });

    const home_ = await tool("get_page", { pageId: "/" });
    const hero = home_.sections[0];
    await tool("update_section", {
      pageId: "accueil",
      sectionId: hero.id,
      changes: { title: "Titre écrit par l'assistant" },
    });
    await tool("set_style", {
      pageId: "accueil",
      sectionId: hero.id,
      element: "title",
      style: { color: "#0000ff" },
    });
    await expect
      .poll(() => frame.locator("h1").innerText(), { timeout: 20_000 })
      .toContain("Titre écrit par l'assistant");
    await expect
      .poll(
        () => frame.locator('h1 [data-of="title"]').evaluate((el) => getComputedStyle(el).color),
        {
          timeout: 20_000,
        },
      )
      .toBe("rgb(0, 0, 255)");
    await page.getByText("L'assistant IA a modifié cette page.").first().waitFor();
    const saved = (await db.doc("of_pages/accueil").get()).data();
    expect(saved?.updatedBy).toBe("Assistant IA");
    expect(saved?.data.content[0].props._style.fields.title.base.color).toBe("#0000ff");
  });

  it("exposes the same tools to the browser assistant (WebMCP), editing the open page", async () => {
    const names = await page.evaluate(() => Object.keys((window as any).__webmcpTools));
    expect(names).toContain("get_site_overview");
    expect(names).toContain("publish");
    const result = await page.evaluate(async () => {
      const tools = (window as any).__webmcpTools;
      const home = await tools.get_page.execute({ pageId: "accueil" });
      const hero = home.structuredContent.sections[0];
      return tools.update_section.execute({
        pageId: "accueil",
        sectionId: hero.id,
        changes: { subtitle: "Sous-titre écrit par l'assistant du navigateur" },
      });
    });
    expect(result.isError).toBeFalsy();
    const frame = page.frameLocator("#preview-frame");
    await frame
      .getByText("Sous-titre écrit par l'assistant du navigateur")
      .waitFor({ timeout: 20_000 });
    // The editor saves it, as for any change of the owner (undoable in Puck).
    await expect
      .poll(
        async () => (await db.doc("of_pages/accueil").get()).data()?.data.content[0].props.subtitle,
        {
          timeout: 30_000,
        },
      )
      .toBe("Sous-titre écrit par l'assistant du navigateur");
    await page.getByText("Enregistré", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Terminer" }).click();
  });

  it("revokes the key", async () => {
    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("button", { name: "Assistant IA" }).click();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Révoquer" }).click();
    await page.getByText("Aucune clé pour l'instant.").waitFor({ timeout: 10_000 });
    expect((await mcp("tools/list")).status).toBe(401);
  });
});
