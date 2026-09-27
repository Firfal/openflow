import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// AI assistant of the starter site on the emulators: the entry points of the admin, a key created
// in « Assistant IA », the MCP server (Cloud Function) driven over HTTP like Claude would, the
// OAuth connection (discovery, registration, consent in the admin, tokens, refresh, disconnect),
// changes shown live in the editor, revocation, and the same tools exposed to WebMCP.
const site =
  process.env.CMS_E2E_SITE ?? path.resolve(import.meta.dirname, "../../templates/next-starter");
const PORT = 3102;
const ADMIN = `http://localhost:${PORT}/admin/`;
const OWNER = "proprietaire@exemple.fr";
const FUNCTION = "http://127.0.0.1:5001/demo-openflow/europe-west1/cmsMcp";
const MCP = FUNCTION;
/** Address shown in the admin: `/mcp`, as `https://<site>/mcp` in production. */
const MCP_URL = `${FUNCTION}/mcp`;
const CALLBACK = "http://127.0.0.1:9/callback";
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

async function mcp(method: string, params?: object, token = key, url = MCP) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json().catch(() => null)) as any,
  };
}

async function form(url: string, params: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  return { status: response.status, body: (await response.json()) as any };
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
    env: { ...process.env, NEXT_PUBLIC_CMS_EMULATORS: "1", NEXT_TELEMETRY_DISABLED: "1" },
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
  it("shows the AI entry points and creates an access key", async () => {
    // Pages view: a card invites the owner to connect an assistant.
    await page.getByRole("button", { name: "Connecter Claude ou ChatGPT" }).click();
    await page.getByRole("heading", { name: "Assistant IA", exact: true }).waitFor();
    // With the emulators the address is the function's (`https://<site>/mcp` in production).
    expect(await page.locator(".of-copy__value").first().innerText()).toMatch(
      /:5001\/demo-openflow\/europe-west1\/cmsMcp\/mcp$/,
    );
    await page.screenshot({ path: path.join(SCREENSHOTS, "05-assistant.png") });
    await page.getByText("Clé d'accès", { exact: true }).click();
    await page.getByLabel("Nom de la clé").fill("Claude e2e");
    await page.getByRole("button", { name: "Créer une clé" }).click();
    const value = page.locator(".of-key-created .of-copy__value").first();
    await value.waitFor({ timeout: 30_000 });
    key = (await value.innerText()).trim();
    expect(key).toMatch(/^cmsk_[\w-]{40,}$/);
    await page.getByRole("button", { name: "J'ai copié la clé" }).click();
    await page.getByText("Claude e2e").waitFor();
    // Only the hash is stored.
    const stored = (await db.collection("cms_agent_tokens").get()).docs.map((d) => d.data());
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(key);
  });

  it("refuses MCP requests without a valid key, and points to the OAuth metadata", async () => {
    const refused = await mcp("tools/list", {}, "", MCP_URL);
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toContain(
      `resource_metadata="${FUNCTION}/.well-known/oauth-protected-resource/mcp"`,
    );
    expect((await mcp("tools/list", {}, "cmsk_wrong")).status).toBe(401);
    expect((await mcp("tools/list", {}, "cmsa_wrong")).status).toBe(401);
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
    // Collections: the AI lists and adds items (their title and list values are stored too).
    for (const collection of overview.collections ?? []) {
      const { items } = await tool("list_items", { collection: collection.name });
      expect(items.length).toBe(collection.count);
      const created = await tool("create_item", {
        collection: collection.name,
        title: "Écrit par l'assistant",
        date: "2026-01-02",
      });
      expect(created.path).toBe(`${collection.path}ecrit-par-lassistant/`);
      const meta = (await db.doc(`cms_pages/${created.pageId}`).get()).data();
      expect(meta?.collection).toBe(collection.name);
      expect(meta?.status).toBe("draft");
      expect(meta?.summary?.[collection.titleField]).toBe("Écrit par l'assistant");
      await tool("delete_page", { pageId: created.pageId, confirm: true });
    }
  });

  it("connects an assistant with OAuth: discovery, registration, consent, tokens", async () => {
    // Discovery, as Claude or ChatGPT do from the 401 of the MCP address.
    const refused = await mcp("initialize", {}, "", MCP_URL);
    const metadataUrl = /resource_metadata="([^"]+)"/.exec(
      refused.headers.get("www-authenticate") ?? "",
    )?.[1];
    const resource = (await (await fetch(metadataUrl!)).json()) as any;
    expect(resource.resource).toBe(MCP_URL);
    const issuer = resource.authorization_servers[0];
    const server = (await (
      await fetch(`${issuer}/.well-known/oauth-authorization-server`)
    ).json()) as any;
    expect(server.issuer).toBe(issuer);
    expect(server.code_challenge_methods_supported).toEqual(["S256"]);

    // Dynamic client registration.
    const registered = await fetch(server.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Claude e2e OAuth",
        redirect_uris: [CALLBACK],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
      }),
    });
    expect(registered.status).toBe(201);
    const { client_id } = (await registered.json()) as any;

    // Authorization: the owner lands on the consent screen of the admin.
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorize = new URL(server.authorization_endpoint);
    for (const [name, value] of Object.entries({
      response_type: "code",
      client_id,
      redirect_uri: CALLBACK,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "etat-e2e",
      resource: MCP_URL,
      scope: "site",
    })) {
      authorize.searchParams.set(name, value);
    }
    const started = await fetch(authorize, { redirect: "manual" });
    expect(started.status).toBe(302);
    const consent = started.headers.get("location")!;
    expect(consent).toContain(`${ADMIN}?view=connect&request=`);

    let callback = "";
    await page.route(`${CALLBACK}**`, (route) => {
      callback = route.request().url();
      return route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
    });
    await page.goto(consent);
    await page
      .getByRole("heading", { name: /Autoriser «\s*Claude e2e OAuth\s*»/ })
      .waitFor({ timeout: 60_000 });
    await page.screenshot({ path: path.join(SCREENSHOTS, "05b-consent.png") });
    await page.getByRole("button", { name: "Autoriser" }).click();
    await expect.poll(() => callback, { timeout: 20_000 }).not.toBe("");
    const answer = new URL(callback);
    expect(answer.searchParams.get("state")).toBe("etat-e2e");
    expect(answer.searchParams.get("iss")).toBe(issuer);
    const code = answer.searchParams.get("code")!;

    // Tokens (PKCE), single-use code.
    const exchange = {
      grant_type: "authorization_code",
      code,
      redirect_uri: CALLBACK,
      client_id,
      code_verifier: verifier,
    };
    const tokens = await form(server.token_endpoint, exchange);
    expect(tokens.status).toBe(200);
    expect(tokens.body.access_token).toMatch(/^cmsa_/);
    expect((await form(server.token_endpoint, exchange)).body.error).toBe("invalid_grant");
    expect((await mcp("tools/list", {}, tokens.body.access_token, MCP_URL)).status).toBe(200);

    // Refresh, rotated: the old refresh token no longer works.
    const refreshed = await form(server.token_endpoint, {
      grant_type: "refresh_token",
      refresh_token: tokens.body.refresh_token,
      client_id,
    });
    expect(refreshed.status).toBe(200);
    expect(
      (
        await form(server.token_endpoint, {
          grant_type: "refresh_token",
          refresh_token: tokens.body.refresh_token,
          client_id,
        })
      ).status,
    ).toBe(400);
    const access = refreshed.body.access_token;
    expect((await mcp("tools/list", {}, access, MCP_URL)).status).toBe(200);
    expect((await mcp("tools/list", {}, tokens.body.access_token, MCP_URL)).status).toBe(401);

    // The owner sees the assistant in « Assistant IA » and disconnects it.
    await page.unroute(`${CALLBACK}**`);
    await page.goto(`${ADMIN}?view=assistant`);
    const row = page.locator(".of-list__item", { hasText: "Claude e2e OAuth" });
    await row.waitFor({ timeout: 60_000 });
    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "Déconnecter" }).click();
    // The list updates before the server confirms: wait for the confirmation.
    await page.getByText("Assistant déconnecté.").waitFor({ timeout: 10_000 });
    expect(await row.count()).toBe(0);
    expect((await mcp("tools/list", {}, access, MCP_URL)).status).toBe(401);
  });

  it("sends a refusal back to the assistant", async () => {
    const registered = (await (
      await fetch(`${FUNCTION}/mcp/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: "Inconnu", redirect_uris: [CALLBACK] }),
      })
    ).json()) as any;
    const authorize = new URL(`${FUNCTION}/mcp/oauth/authorize`);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", registered.client_id);
    authorize.searchParams.set("redirect_uri", CALLBACK);
    authorize.searchParams.set("code_challenge", "a".repeat(43));
    authorize.searchParams.set("code_challenge_method", "S256");
    const started = await fetch(authorize, { redirect: "manual" });
    let callback = "";
    await page.route(`${CALLBACK}**`, (route) => {
      callback = route.request().url();
      return route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
    });
    await page.goto(started.headers.get("location")!);
    await page.getByRole("button", { name: "Refuser" }).click();
    await expect.poll(() => callback, { timeout: 20_000 }).toContain("error=access_denied");
    await page.unroute(`${CALLBACK}**`);
    // A redirect URI that was not registered is never redirected to.
    authorize.searchParams.set("redirect_uri", "https://evil.example/cb");
    const refused = await fetch(authorize, { redirect: "manual" });
    expect(refused.status).toBe(400);
    await page.goto(ADMIN);
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor({ timeout: 60_000 });
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
    const saved = (await db.doc("cms_page_content/accueil").get()).data();
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
        async () =>
          (await db.doc("cms_page_content/accueil").get()).data()?.data.content[0].props.subtitle,
        {
          timeout: 30_000,
        },
      )
      .toBe("Sous-titre écrit par l'assistant du navigateur");
    await page.getByText("Enregistré", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Retour aux pages" }).click();
  });

  it("revokes the key", async () => {
    await page.getByRole("button", { name: "Assistant IA", exact: true }).click();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Révoquer" }).click();
    await page.getByText("Aucune IA connectée pour l'instant.").waitFor({ timeout: 10_000 });
    expect((await mcp("tools/list")).status).toBe(401);
  });
});
