import type { Data } from "@puckeditor/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_TOOLS,
  type AgentBackend,
  type AgentContext,
  type AgentPage,
  type AgentSettings,
  buildSiteSchema,
  configFromSchema,
  defineConfig,
  handleMcpMessage,
  imageField,
  linkField,
  runAgentTool,
  sanitizeRichText,
  validatePageData,
} from "../src/index.js";

const config = defineConfig({
  site: { name: "Boulangerie" },
  categories: { main: { title: "Contenu", components: ["Hero", "Faq"] } },
  components: {
    Hero: {
      label: "En-tête",
      fields: {
        title: { type: "text", label: "Titre", contentEditable: true },
        body: { type: "richtext", label: "Texte" },
        image: imageField({ label: "Image" }),
        cta: linkField({ label: "Bouton" }),
        tone: {
          type: "radio",
          label: "Fond",
          options: [
            { label: "Clair", value: "light" },
            { label: "Sombre", value: "dark" },
          ],
        },
      },
      defaultProps: {
        title: "Bienvenue",
        body: "<p>Texte</p>",
        image: null,
        cta: null,
        tone: "light",
      },
      render: () => null as never,
    },
    Faq: {
      label: "Questions",
      fields: {
        items: {
          type: "array",
          label: "Questions",
          arrayFields: {
            question: { type: "text", label: "Question", contentEditable: true },
            answer: { type: "textarea", label: "Réponse", contentEditable: true },
          },
          defaultItemProps: { question: "Question", answer: "Réponse" },
        },
      },
      defaultProps: { items: [{ question: "Q1", answer: "R1" }] },
      render: () => null as never,
    },
  },
  settings: {
    fields: { phone: { type: "text", label: "Téléphone" } },
    defaultProps: { phone: "01 00 00 00 00" },
  },
  theme: {
    colors: [{ token: "ink", label: "Encre", value: "#101820" }],
    fonts: [{ token: "display", label: "Titres", value: "var(--font-a)" }],
    fontOptions: [
      { label: "A", value: "var(--font-a)" },
      { label: "B", value: "var(--font-b)" },
    ],
  },
});

function memoryBackend() {
  const pages = new Map<string, AgentPage>();
  const settings: AgentSettings = {
    site: { name: "Boulangerie", lang: "fr" },
    values: {},
    theme: {},
  };
  const saves: string[] = [];
  const home: Data = {
    root: { props: {} },
    content: [
      {
        type: "Hero",
        props: {
          id: "hero",
          title: "Bonjour",
          body: "<p>x</p>",
          image: null,
          cta: null,
          tone: "light",
        },
      },
      { type: "Faq", props: { id: "faq", items: [{ question: "Q1", answer: "R1" }] } },
    ],
  };
  pages.set("accueil", {
    id: "accueil",
    slug: "",
    title: "Accueil",
    status: "published",
    seo: {},
    data: home,
  });
  pages.set("contact", {
    id: "contact",
    slug: "contact",
    title: "Contact",
    status: "published",
    seo: {},
    data: { root: { props: {} }, content: [] },
  });
  const backend: AgentBackend = {
    listPages: async () => [...pages.values()],
    getPage: async (id) => pages.get(id),
    savePageData: async (id, data) => {
      saves.push(id);
      pages.set(id, { ...(pages.get(id) as AgentPage), data });
    },
    savePageMeta: async (id, meta) => {
      pages.set(id, { ...(pages.get(id) as AgentPage), ...meta });
    },
    createPage: async (id, page) => {
      pages.set(id, { id, ...page });
      return id;
    },
    deletePage: async (id) => {
      pages.delete(id);
    },
    getSettings: async () => structuredClone(settings),
    saveSettingsValues: async (values) => {
      settings.values = values;
    },
    saveTheme: async (theme) => {
      settings.theme = theme;
    },
    listMedia: async () => [
      {
        id: "m1",
        url: "/images/a.webp",
        name: "a.webp",
        contentType: "image/webp",
        source: "static",
      },
    ],
    importMedia: async (url) => ({
      id: "m2",
      url: `https://storage/${url.split("/").pop()}`,
      name: "x",
      contentType: "image/png",
      width: 10,
      height: 5,
    }),
    publish: async () => ({ releaseId: "r1" }),
    listReleases: async () => [{ id: "r0", status: "live", createdAt: "2026-09-01T00:00:00Z" }],
  };
  return { backend, pages, settings, saves };
}

let store: ReturnType<typeof memoryBackend>;
let ctx: AgentContext;

beforeEach(() => {
  store = memoryBackend();
  // As on the server: the config is rebuilt from its serialized schema.
  const schema = buildSiteSchema(config);
  ctx = {
    config: configFromSchema(JSON.parse(JSON.stringify(schema))),
    schema,
    backend: store.backend,
  };
});

const run = (name: string, args: unknown) => runAgentTool(name, args, ctx) as Promise<any>;

describe("site schema", () => {
  it("round-trips the fields needed for validation", () => {
    const rebuilt = ctx.config;
    const data = store.pages.get("accueil")!.data;
    expect(validatePageData(data, rebuilt)).toEqual([]);
    const bad = structuredClone(data);
    (bad.content[0]!.props as any).tone = "neon";
    expect(validatePageData(bad, rebuilt).map((i) => i.rule)).toEqual(["OF-201"]);
    expect(ctx.schema.sections.Hero?.category).toBe("Contenu");
    expect(ctx.schema.sections.Hero?.fields.image?.type).toBe("image");
  });
});

describe("agent tools", () => {
  it("advertises JSON schemas for every tool", () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(names).toContain("update_section");
    expect(names).toContain("publish");
    for (const t of AGENT_TOOLS) expect(t.inputSchema.type).toBe("object");
    expect(AGENT_TOOLS.find((t) => t.name === "get_page")?.annotations.readOnlyHint).toBe(true);
  });

  it("gives an overview and reads a page by id or address", async () => {
    const overview = await run("get_site_overview", {});
    expect(overview.pages.map((p: any) => p.path)).toEqual(["/", "/contact/"]);
    expect(overview.theme.colors[0]).toMatchObject({ token: "color-ink", value: "#101820" });
    const page = await run("get_page", { pageId: "/" });
    expect(page.sections[1]).toMatchObject({ id: "faq", type: "Faq", label: "Questions" });
    await expect(run("get_page", { pageId: "nope" })).rejects.toThrow(/introuvable/);
  });

  it("updates fields by path, including list items", async () => {
    const result = await run("update_section", {
      pageId: "accueil",
      sectionId: "faq",
      changes: {
        "items[0].answer": "Oui, le dimanche.",
        "items[1]": { question: "Q2", answer: "R2" },
      },
    });
    expect(result.section.values.items).toEqual([
      { question: "Q1", answer: "Oui, le dimanche." },
      { question: "Q2", answer: "R2" },
    ]);
    expect(store.saves).toEqual(["accueil"]);
  });

  it("normalizes values: rich text, internal links, images", async () => {
    await run("update_section", {
      pageId: "accueil",
      sectionId: "hero",
      changes: {
        body: '<p onclick="x()">Pain <strong>chaud</strong><script>alert(1)</script></p>',
        cta: { kind: "page", pageId: "contact" },
        image: "/images/a.webp",
      },
    });
    const hero = store.pages.get("accueil")!.data.content[0]!.props as any;
    expect(hero.body).toBe("<p>Pain <strong>chaud</strong></p>");
    expect(hero.cta).toEqual({ kind: "page", pageId: "contact", href: "/contact/" });
    expect(hero.image).toEqual({ alt: "", src: "/images/a.webp" });
  });

  it("refuses unknown fields, invalid options and unsafe links", async () => {
    const update = (changes: object) =>
      run("update_section", { pageId: "accueil", sectionId: "hero", changes });
    await expect(update({ subtitle: "x" })).rejects.toThrow(/inconnu.*title/);
    await expect(update({ tone: "neon" })).rejects.toThrow(/refusée/);
    await expect(update({ cta: { kind: "url", href: "javascript:alert(1)" } })).rejects.toThrow(
      /lien refusé/,
    );
    await expect(update({ image: { src: "data:image/png;base64,x" } })).rejects.toThrow(/invalide/);
    await expect(update({ _style: {} })).rejects.toThrow(/set_style/);
    expect(store.saves).toEqual([]);
  });

  it("adds, duplicates, moves and removes sections", async () => {
    const added = await run("add_section", {
      pageId: "accueil",
      type: "Faq",
      values: { items: [{ question: "Livrez-vous ?" }] },
      afterSectionId: "hero",
    });
    let content = store.pages.get("accueil")!.data.content;
    expect(content.map((c) => c.type)).toEqual(["Hero", "Faq", "Faq"]);
    // List items get their defaults.
    expect((content[1]!.props as any).items[0]).toEqual({
      question: "Livrez-vous ?",
      answer: "Réponse",
    });
    const copy = await run("duplicate_section", { pageId: "accueil", sectionId: added.sectionId });
    await run("move_section", { pageId: "accueil", sectionId: copy.sectionId, position: 0 });
    content = store.pages.get("accueil")!.data.content;
    expect(content[0]!.props.id).toBe(copy.sectionId);
    await run("remove_section", { pageId: "accueil", sectionId: copy.sectionId });
    expect(store.pages.get("accueil")!.data.content).toHaveLength(3);
    await expect(run("add_section", { pageId: "accueil", type: "Nope" })).rejects.toThrow(
      /inconnu/,
    );
  });

  it("sets and resets styles per screen", async () => {
    await run("set_style", {
      pageId: "accueil",
      sectionId: "hero",
      element: "title",
      screen: "mobile",
      style: { color: "#ff0000", fontSize: "32px" },
    });
    await run("set_style", { pageId: "accueil", sectionId: "hero", style: { paddingTop: "80px" } });
    let style = (store.pages.get("accueil")!.data.content[0]!.props as any)._style;
    expect(style).toEqual({
      section: { base: { paddingTop: "80px" } },
      fields: { title: { mobile: { color: "#ff0000", fontSize: "32px" } } },
    });
    await expect(
      run("set_style", { pageId: "accueil", sectionId: "hero", style: { color: "red;}body{" } }),
    ).rejects.toThrow(/refusées/);
    await expect(
      run("set_style", { pageId: "accueil", sectionId: "hero", element: "nope", style: {} }),
    ).rejects.toThrow(/Éléments de cette section : title, body, image/);
    await run("set_style", {
      pageId: "accueil",
      sectionId: "hero",
      element: "title",
      screen: "mobile",
      style: { color: null, fontSize: null },
    });
    style = (store.pages.get("accueil")!.data.content[0]!.props as any)._style;
    expect(style).toEqual({ section: { base: { paddingTop: "80px" } } });
  });

  it("creates, updates and deletes pages", async () => {
    const created = await run("create_page", {
      title: "Nos tarifs",
      sections: [{ type: "Hero", values: { title: "Tarifs" } }],
    });
    expect(created).toMatchObject({ pageId: "nos-tarifs", path: "/nos-tarifs/", status: "draft" });
    await expect(run("create_page", { title: "Autre", path: "/contact/" })).rejects.toThrow(
      /déjà utilisée/,
    );
    await run("update_page", {
      pageId: "nos-tarifs",
      status: "published",
      seo: { title: "Tarifs 2026" },
    });
    expect(store.pages.get("nos-tarifs")).toMatchObject({
      status: "published",
      seo: { title: "Tarifs 2026" },
    });
    await expect(run("update_page", { pageId: "accueil", path: "/home/" })).rejects.toThrow(
      /accueil/,
    );
    await expect(run("delete_page", { pageId: "nos-tarifs" })).rejects.toThrow(/confirm/);
    await run("delete_page", { pageId: "nos-tarifs", confirm: true });
    expect(store.pages.has("nos-tarifs")).toBe(false);
    await expect(run("delete_page", { pageId: "/", confirm: true })).rejects.toThrow(/accueil/);
  });

  it("edits settings and theme tokens", async () => {
    await run("update_settings", { changes: { phone: "02 00 00 00 00" } });
    expect(store.settings.values.phone).toBe("02 00 00 00 00");
    await run("set_theme", { tokens: { "color-ink": "#000000", "font-display": "var(--font-b)" } });
    expect(store.settings.theme).toEqual({
      "color-ink": "#000000",
      "font-display": "var(--font-b)",
    });
    await expect(
      run("set_theme", { tokens: { "font-display": "var(--font-evil)" } }),
    ).rejects.toThrow(/non disponible/);
    await expect(run("set_theme", { tokens: { "color-x": "#000" } })).rejects.toThrow(/inconnu/);
    await run("set_theme", { tokens: { "color-ink": null } });
    expect(store.settings.theme).toEqual({ "font-display": "var(--font-b)" });
  });

  it("imports media and publishes", async () => {
    await expect(run("import_media", { url: "http://x.fr/a.png" })).rejects.toThrow(/https/);
    const imported = await run("import_media", { url: "https://x.fr/a.png", alt: "Pain" });
    expect(imported.value).toEqual({
      src: "https://storage/a.png",
      alt: "Pain",
      width: 10,
      height: 5,
    });
    expect(await run("list_media", { kind: "video" })).toEqual([]);
    expect((await run("publish", {})).releaseId).toBe("r1");
    expect((await run("get_publication_status", {}))[0].label).toBe("en ligne");
  });
});

describe("rich text", () => {
  it("keeps formatting and drops anything executable", () => {
    expect(sanitizeRichText('<p>a <a href="https://x.fr" onclick="y">b</a> <em>c</em></p>')).toBe(
      '<p>a <a href="https://x.fr" target="_blank" rel="noopener noreferrer">b</a> <em>c</em></p>',
    );
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeRichText("<img src=x onerror=alert(1)><p>ok</p>")).toBe("<p>ok</p>");
    expect(sanitizeRichText("<style>*{}</style><iframe src=x></iframe>t")).toBe("t");
    // Broken markup ends up as inert text.
    expect(sanitizeRichText("<scr<script>ipt>alert(1)</script>")).toBe("ipt&gt;alert(1)");
    expect(sanitizeRichText("1 < 2 > 0")).toBe("1 &lt; 2 &gt; 0");
    expect(sanitizeRichText("<p>a<!-- x --></p><br/>")).toBe("<p>a</p><br>");
  });
});

describe("MCP protocol", () => {
  const options = () => ({ context: ctx, siteName: "Boulangerie" });

  it("initializes, lists tools and calls one", async () => {
    const init = (await handleMcpMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      options(),
    )) as any;
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.capabilities.tools).toBeDefined();
    expect(init.result.instructions).toContain("Boulangerie");
    expect(
      await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, options()),
    ).toBeUndefined();
    const list = (await handleMcpMessage(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      options(),
    )) as any;
    expect(list.result.tools.length).toBe(AGENT_TOOLS.length);
    const call = (await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_page", arguments: { pageId: "contact" } },
      },
      options(),
    )) as any;
    expect(call.result.structuredContent.title).toBe("Contact");
    expect(JSON.parse(call.result.content[0].text).path).toBe("/contact/");
  });

  it("reports tool errors in the result and protocol errors as JSON-RPC errors", async () => {
    const failed = (await handleMcpMessage(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_page", arguments: {} } },
      options(),
    )) as any;
    expect(failed.result.isError).toBe(true);
    expect(failed.result.content[0].text).toMatch(/Paramètres invalides/);
    const unknown = (await handleMcpMessage(
      { jsonrpc: "2.0", id: 5, method: "nope" },
      options(),
    )) as any;
    expect(unknown.error.code).toBe(-32601);
    const invalid = (await handleMcpMessage({ hello: 1 }, options())) as any;
    expect(invalid.error.code).toBe(-32600);
    const batch = (await handleMcpMessage(
      [
        { jsonrpc: "2.0", id: 6, method: "ping" },
        { jsonrpc: "2.0", method: "notifications/cancelled" },
      ],
      options(),
    )) as any[];
    expect(batch).toEqual([{ jsonrpc: "2.0", id: 6, result: {} }]);
  });
});
