import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Data } from "@puckeditor/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type AgentBackend,
  type AgentContext,
  type AgentPage,
  adjacentEntries,
  buildCollections,
  buildLlmsFullTxt,
  buildLlmsTxt,
  buildRssFeed,
  buildSiteSchema,
  configFromSchema,
  createSnapshot,
  dateField,
  defineConfig,
  formatDate,
  getCollection,
  imageField,
  isValidDate,
  itemMeta,
  jsonLdScript,
  newItemData,
  pageJsonLd,
  runAgentTool,
  validateConfig,
  validateItem,
  validatePageData,
} from "../src/index.js";
import { loadSeed } from "../src/node.js";

const config = defineConfig({
  site: { name: "Boulangerie", lang: "fr" },
  components: {
    Hero: {
      label: "En-tête",
      fields: { title: { type: "text", contentEditable: true } },
      defaultProps: { title: "Bienvenue" },
      render: () => null as never,
    },
    Article: {
      label: "Article",
      fields: {
        title: { type: "text", label: "Titre", contentEditable: true },
        date: dateField({ label: "Date" }),
        excerpt: { type: "textarea", label: "Chapeau", contentEditable: true },
        cover: imageField({ label: "Image" }),
        body: { type: "richtext", label: "Texte" },
      },
      defaultProps: {
        title: "Titre de l'article",
        date: "2026-01-01",
        excerpt: "",
        cover: null,
        body: "<p>Écrivez votre article ici.</p>",
      },
      render: () => null as never,
    },
  },
  collections: {
    actualites: {
      label: "Actualités",
      addLabel: "Nouvel article",
      path: "actualites",
      component: "Article",
      dateField: "date",
      descriptionField: "excerpt",
      imageField: "cover",
    },
  },
});

const article = (title: string, date: string, body = "<p>Du pain chaud.</p>", excerpt = "") =>
  ({
    root: { props: {} },
    content: [{ type: "Article", props: { id: "a", title, date, excerpt, cover: null, body } }],
  }) as Data;

describe("dates", () => {
  it("validates and formats calendar dates", () => {
    expect(isValidDate("2026-03-12")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("12/03/2026")).toBe(false);
    expect(formatDate("2026-03-12", "fr")).toBe("12 mars 2026");
    expect(formatDate("2026-03-12", "en")).toBe("March 12, 2026");
    // Anything else is shown as it is: a page never breaks on a date.
    expect(formatDate("bientôt")).toBe("bientôt");
    expect(formatDate(undefined)).toBe("");
  });

  it("checks date values in content", () => {
    const bad = article("Titre", "demain");
    expect(validatePageData(bad, config)[0]?.message).toContain("AAAA-MM-JJ");
    expect(validatePageData(article("Titre", ""), config)).toEqual([]);
  });
});

describe("collection config", () => {
  it("accepts a valid collection", () => {
    expect(validateConfig(config)).toEqual([]);
  });

  it("reports unknown sections and fields of the wrong kind", () => {
    const broken = defineConfig({
      ...config,
      collections: {
        Blog: { label: "", path: "/blog/", component: "Nope" },
        actus: {
          label: "Actus",
          path: "actualites",
          component: "Article",
          dateField: "title",
          imageField: "missing",
        },
      },
    });
    const messages = validateConfig(broken).map((issue) => issue.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("nom invalide"),
        expect.stringContaining("`label` est obligatoire"),
        expect.stringContaining("`path` invalide"),
        expect.stringContaining("« Nope » n'existe pas"),
        expect.stringContaining("la date « title » doit être un champ `dateField()`"),
        expect.stringContaining("l'image « missing » n'est pas un champ"),
      ]),
    );
  });
});

describe("items", () => {
  it("keeps the item's section on items only, and the address under the collection", () => {
    const item = {
      slug: "actualites/pain",
      collection: "actualites",
      data: article("Pain", "2026-03-01"),
    };
    expect(validateItem(item, config)).toEqual([]);
    expect(validateItem({ ...item, slug: "pain" }, config)[0]?.message).toContain("/actualites/");
    expect(
      validateItem({ ...item, data: { root: { props: {} }, content: [] } }, config)[0]?.message,
    ).toContain("une seule section « Article »");
    expect(validateItem({ slug: "a-propos", data: item.data }, config)[0]?.message).toContain(
      "réservée aux éléments",
    );
    expect(validateItem({ ...item, collection: "blog" }, config)[0]?.message).toContain(
      "Collection inconnue",
    );
  });

  it("derives the title and the list values from the item's section", () => {
    const body = `<p>${"mot ".repeat(450)}</p>`;
    const meta = itemMeta(
      article("  Le pain   du samedi ", "2026-03-01", body),
      config.collections!.actualites!,
      config,
    );
    expect(meta.title).toBe("Le pain du samedi");
    // No rich text in the summary (it can be long), but its beginning and the words.
    expect(meta.summary.body).toBeUndefined();
    expect(String(meta.summary._excerpt)).toMatch(/^mot mot .*…$/);
    expect(String(meta.summary._excerpt).length).toBeLessThanOrEqual(221);
    expect(meta.summary._words).toBeGreaterThan(450);
    expect(meta.summary.date).toBe("2026-03-01");
  });

  it("creates a new item with its title and today's date", () => {
    const data = newItemData(config.collections!.actualites!, config, { title: "Nouveau" });
    const props = data.content[0]!.props as Record<string, unknown>;
    expect(data.content[0]!.type).toBe("Article");
    expect(props.title).toBe("Nouveau");
    expect(isValidDate(props.date)).toBe(true);
    expect(props.body).toBe("<p>Écrivez votre article ici.</p>");
  });
});

describe("listing items", () => {
  const pages = [
    {
      id: "a",
      slug: "actualites/a",
      title: "A",
      collection: "actualites",
      status: "published" as const,
      data: article("A", "2026-01-10", "<p>Texte A</p>", "Résumé A"),
    },
    {
      id: "b",
      slug: "actualites/b",
      title: "B",
      collection: "actualites",
      status: "published" as const,
      data: article("B", "2026-03-10"),
    },
    {
      id: "c",
      slug: "actualites/c",
      title: "C",
      collection: "actualites",
      status: "draft" as const,
      data: article("C", "2026-05-10"),
    },
    {
      id: "home",
      slug: "",
      title: "Accueil",
      status: "published" as const,
      data: { root: { props: {} }, content: [] },
    },
  ];

  it("lists visible items, newest first, with description, date and reading time", () => {
    const { actualites } = buildCollections(pages, config);
    expect(actualites!.map((e) => e.id)).toEqual(["b", "a"]);
    const [b, a] = actualites!;
    expect(a).toMatchObject({
      href: "/actualites/a/",
      title: "A",
      date: "2026-01-10",
      description: "Résumé A",
      readingTime: 1,
    });
    // Without a description, the beginning of the text.
    expect(b!.description).toBe("Du pain chaud.");
    expect(b!.fields.title).toBe("B");
  });

  it("gives sections the items and the neighbours of an item page", () => {
    const collections = buildCollections(pages, config);
    const metadata = {
      page: { id: "a", slug: "actualites/a", title: "A", collection: "actualites" },
      collections,
    };
    expect(getCollection(metadata, "actualites")).toHaveLength(2);
    expect(getCollection({}, "actualites")).toEqual([]);
    expect(adjacentEntries(metadata).previous?.id).toBe("b");
    expect(adjacentEntries(metadata).next).toBeUndefined();
    expect(adjacentEntries({ page: { id: "home", slug: "", title: "" } })).toEqual({});
  });

  it("publishes items with their collection, grouped in llms.txt", () => {
    const snapshot = createSnapshot({
      releaseId: "r1",
      settings: { site: { name: "Boulangerie", lang: "fr", url: "https://pain.fr" }, values: {} },
      pages: pages.map((p) => ({ ...p, seo: {} })),
    });
    expect(snapshot.pages.find((p) => p.id === "a")?.collection).toBe("actualites");
    expect(snapshot.pages.find((p) => p.id === "home")?.collection).toBeUndefined();
    const llms = buildLlmsTxt(snapshot, config);
    expect(llms).toContain("## Actualités");
    expect(llms).toContain("- [B](https://pain.fr/actualites/b/) (10 mars 2026): Du pain chaud.");
    expect(llms.indexOf("## Pages")).toBeLessThan(llms.indexOf("## Actualités"));
    expect(llms.split("## Actualités")[0]).not.toContain("/actualites/b/");
    expect(buildLlmsFullTxt(snapshot, config)).toContain("Date : 10 janvier 2026");
  });
});

describe("seed", () => {
  it("reads items and takes their title from their section", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "of-seed-"));
    await mkdir(path.join(dir, "openflow", "seed", "pages"), { recursive: true });
    const write = (name: string, value: unknown) =>
      writeFile(path.join(dir, "openflow", "seed", "pages", name), JSON.stringify(value));
    await write("accueil.json", { slug: "", title: "Accueil", data: { content: [] } });
    await write("pain.json", {
      slug: "actualites/pain",
      title: "Titre à remplacer",
      collection: "actualites",
      data: article("Le pain du samedi", "2026-03-01"),
    });
    const { seed, issues } = await loadSeed(dir, config);
    expect(issues).toEqual([]);
    const item = seed!.pages.find((p) => p.id === "pain");
    expect(item?.collection).toBe("actualites");
    expect(item?.title).toBe("Le pain du samedi");
  });
});

// ---------------------------------------------------------------------------------------------
// AI tools

function memoryBackend() {
  const pages = new Map<string, AgentPage & { summary?: Record<string, unknown> }>();
  pages.set("accueil", {
    id: "accueil",
    slug: "",
    title: "Accueil",
    status: "published",
    seo: {},
    data: {
      root: { props: {} },
      content: [{ type: "Hero", props: { id: "hero", title: "Bonjour" } }],
    },
  });
  pages.set("pain", {
    id: "pain",
    slug: "actualites/pain",
    title: "Le pain",
    status: "published",
    seo: {},
    collection: "actualites",
    data: article("Le pain", "2026-03-01"),
  });
  const backend = {
    listPages: async () => [...pages.values()],
    getPage: async (id: string) => pages.get(id),
    savePageData: async (id, data, meta) => {
      pages.set(id, {
        ...pages.get(id)!,
        data,
        ...(meta?.title ? { title: meta.title } : {}),
        ...(meta ? { summary: meta.summary } : {}),
      });
    },
    savePageMeta: async (id, meta) => {
      pages.set(id, { ...pages.get(id)!, ...meta });
    },
    createPage: async (id, page) => {
      pages.set(id, { id, ...page });
      return id;
    },
    deletePage: async (id) => {
      pages.delete(id);
    },
  } as Partial<AgentBackend> as AgentBackend;
  backend.getSettings = async () => ({
    site: { name: "Boulangerie", lang: "fr" },
    values: {},
    theme: {},
  });
  backend.listReleases = async () => [];
  return { backend, pages };
}

let store: ReturnType<typeof memoryBackend>;
let ctx: AgentContext;
const run = (name: string, args: unknown) => runAgentTool(name, args, ctx) as Promise<any>;

beforeEach(() => {
  store = memoryBackend();
  const schema = buildSiteSchema(config);
  ctx = {
    config: configFromSchema(JSON.parse(JSON.stringify(schema))),
    schema,
    backend: store.backend,
  };
});

describe("AI tools for collections", () => {
  it("keeps collections and dates in the serialized schema", () => {
    expect(ctx.schema.sections.Article?.fields.date?.type).toBe("date");
    expect(ctx.config.collections?.actualites?.component).toBe("Article");
    expect(validatePageData(article("x", "2026-13-40"), ctx.config)).toHaveLength(1);
  });

  it("describes collections apart from pages", async () => {
    const overview = await run("get_site_overview", {});
    expect(overview.pages.map((p: any) => p.id)).toEqual(["accueil"]);
    expect(overview.collections[0]).toMatchObject({
      name: "actualites",
      label: "Actualités",
      itemSection: "Article",
      count: 1,
    });
    expect(overview.sectionTypes.map((t: any) => t.type)).toEqual(["Hero"]);
  });

  it("creates an item with its values, then lists it", async () => {
    const created = await run("create_item", {
      collection: "actualites",
      title: "Horaires d'été",
      date: "2026-07-01",
      values: {
        excerpt: "Ouvert tous les jours.",
        body: "<p>Du lundi au dimanche.</p><script>x</script>",
      },
    });
    expect(created).toMatchObject({
      ok: true,
      path: "/actualites/horaires-dete/",
      status: "draft",
    });
    const page = store.pages.get(created.pageId)!;
    expect(page.collection).toBe("actualites");
    expect(page.summary?.excerpt).toBe("Ouvert tous les jours.");
    expect((page.data.content[0]!.props as any).body).not.toContain("script");
    const { items } = await run("list_items", { collection: "actualites" });
    expect(items.map((i: any) => i.title)).toEqual(["Horaires d'été", "Le pain"]);
    expect((await run("list_items", { collection: "actualites", query: "pain" })).count).toBe(1);
    await expect(run("list_items", { collection: "blog" })).rejects.toThrow("inconnue");
  });

  it("keeps the title of an item in sync, and its address under the collection", async () => {
    await run("update_section", {
      pageId: "pain",
      sectionId: "a",
      changes: { title: "Pain au levain" },
    });
    expect(store.pages.get("pain")!.title).toBe("Pain au levain");
    await run("update_page", { pageId: "pain", title: "Pain complet", path: "/pain-complet/" });
    const page = store.pages.get("pain")!;
    expect(page.title).toBe("Pain complet");
    expect((page.data.content[0]!.props as any).title).toBe("Pain complet");
    expect(page.slug).toBe("actualites/pain-complet");
  });

  it("refuses to break an item or to use its section on a page", async () => {
    await expect(run("remove_section", { pageId: "pain", sectionId: "a" })).rejects.toThrow(
      "une seule section",
    );
    await expect(run("duplicate_section", { pageId: "pain", sectionId: "a" })).rejects.toThrow(
      "une seule section",
    );
    await expect(run("add_section", { pageId: "accueil", type: "Article" })).rejects.toThrow(
      "réservée aux éléments",
    );
    await expect(run("create_page", { title: "Test", path: "/actualites/test/" })).rejects.toThrow(
      "create_item",
    );
    // Other sections may go around the article.
    await run("add_section", { pageId: "pain", type: "Hero" });
    expect(store.pages.get("pain")!.data.content).toHaveLength(2);
  });
});

describe("structured data and feed", () => {
  const snapshot = createSnapshot({
    releaseId: "r1",
    settings: {
      site: { name: "Boulangerie", lang: "fr", url: "https://pain.fr", description: "Du bon pain" },
      values: {},
    },
    pages: [
      {
        id: "home",
        slug: "",
        title: "Accueil",
        status: "published",
        seo: {},
        data: { root: { props: {} }, content: [] },
      },
      {
        id: "list",
        slug: "actualites",
        title: "Actualités",
        status: "published",
        seo: {},
        data: { root: { props: {} }, content: [] },
      },
      {
        id: "pain",
        slug: "actualites/pain",
        title: "Le pain",
        status: "published",
        seo: {},
        collection: "actualites",
        data: {
          root: { props: {} },
          content: [
            {
              type: "Article",
              props: {
                id: "a",
                title: "Le pain",
                date: "2026-03-01",
                excerpt: "Chaud & croustillant <3",
                cover: {
                  src: "https://cdn/x.png",
                  alt: "",
                  variants: [{ url: "https://cdn/x-1280.webp", width: 1280, height: 720 }],
                },
                body: "<p>Texte</p>",
              },
            },
          ],
        },
      },
    ],
  });
  const page = (id: string) => snapshot.pages.find((p) => p.id === id)!;

  it("describes the home page as a WebSite and an item as an Article with its breadcrumb", () => {
    expect(pageJsonLd(snapshot, page("home"), config)[0]).toMatchObject({
      "@type": "WebSite",
      name: "Boulangerie",
      url: "https://pain.fr/",
    });
    const [article, breadcrumb] = pageJsonLd(snapshot, page("pain"), config);
    expect(article).toMatchObject({
      "@type": "Article",
      headline: "Le pain",
      datePublished: "2026-03-01",
      image: ["https://cdn/x-1280.webp"],
      url: "https://pain.fr/actualites/pain/",
    });
    expect((breadcrumb as any).itemListElement.map((s: any) => s.name)).toEqual([
      "Accueil",
      "Actualités",
      "Le pain",
    ]);
    expect(jsonLdScript({ a: "</script>" })).toBe('{"a":"\\u003c/script\\u003e"}');
  });

  it("lists the items in an RSS feed", () => {
    const rss = buildRssFeed(snapshot, config);
    expect(rss).toContain("<title>Boulangerie : Actualités</title>");
    expect(rss).toContain("<link>https://pain.fr/actualites/pain/</link>");
    expect(rss).toContain("<description>Chaud &amp; croustillant &lt;3</description>");
    expect(rss).toContain("<pubDate>Sun, 01 Mar 2026 08:00:00 GMT</pubDate>");
    expect(rss).toContain('type="image/webp"');
    expect(rss).toContain('<atom:link href="https://pain.fr/rss.xml"');
  });
});
