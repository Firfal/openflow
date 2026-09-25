import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyDefaults,
  createSnapshot,
  defineConfig,
  ensureIds,
  imageField,
  isValidSlug,
  linkField,
  linkProps,
  normalizeSlug,
  parseSnapshot,
  SnapshotError,
  slugify,
  slugToParams,
  slugToPath,
  validateConfig,
  validatePageData,
} from "../src/index.js";
import { loadSeed, snapshotFromSeed } from "../src/node.js";

const config = defineConfig({
  site: { name: "Test", lang: "fr" },
  components: {
    Hero: {
      fields: {
        title: { type: "text", contentEditable: true },
        image: imageField(),
        cta: linkField(),
        variant: {
          type: "select",
          options: [
            { label: "Clair", value: "light" },
            { label: "Sombre", value: "dark" },
          ],
        },
      },
      defaultProps: { title: "Bonjour", image: null, cta: null, variant: "light" },
      render: () => null as never,
    },
    Cards: {
      fields: {
        items: {
          type: "array",
          arrayFields: { label: { type: "text" } },
        },
      },
      defaultProps: { items: [] },
      render: () => null as never,
    },
  },
});

describe("slugs", () => {
  it("validates and normalizes slugs", () => {
    expect(isValidSlug("")).toBe(true);
    expect(isValidSlug("a-propos")).toBe(true);
    expect(isValidSlug("blog/mon-article")).toBe(true);
    expect(isValidSlug("A propos")).toBe(false);
    expect(isValidSlug("/a")).toBe(false);
    expect(slugify("Nos Crêpes d’été !")).toBe("nos-crepes-dete");
    expect(normalizeSlug("/À propos/Équipe/")).toBe("a-propos/equipe");
    expect(slugToPath("")).toBe("/");
    expect(slugToPath("a/b")).toBe("/a/b/");
    expect(slugToParams("")).toEqual([]);
    expect(slugToParams("a/b")).toEqual(["a", "b"]);
  });
});

describe("links", () => {
  it("builds anchor props", () => {
    expect(linkProps(null)).toEqual({ href: "#" });
    expect(linkProps({ kind: "url", href: "https://x.fr", newTab: true })).toEqual({
      href: "https://x.fr",
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });
});

describe("ensureIds / applyDefaults", () => {
  it("assigns unique ids, including nested slots", () => {
    const data = ensureIds({
      root: { props: {} },
      content: [
        { type: "Hero", props: { title: "a" } },
        { type: "Hero", props: { id: "Hero-1", title: "b" } },
        {
          type: "Cards",
          props: { items: [], slot: [{ type: "Hero", props: { title: "c" } }] },
        },
      ],
    } as never);
    const ids = [
      data.content[0]!.props.id,
      data.content[1]!.props.id,
      data.content[2]!.props.id,
      (data.content[2]!.props.slot as Array<{ props: { id: string } }>)[0]!.props.id,
    ];
    expect(new Set(ids).size).toBe(4);
    expect(ids[1]).toBe("Hero-1");
  });

  it("merges default props under stored props", () => {
    const data = applyDefaults(
      { root: { props: {} }, content: [{ type: "Hero", props: { id: "h", title: "X" } }] },
      config,
    );
    expect(data.content[0]!.props).toMatchObject({ title: "X", variant: "light", image: null });
  });
});

describe("createSnapshot", () => {
  const settings = { site: { name: "Test", lang: "fr" }, values: {} };
  it("keeps published pages and resolves internal links", () => {
    const snapshot = createSnapshot({
      releaseId: "r1",
      settings,
      pages: [
        {
          id: "home",
          slug: "",
          title: "Accueil",
          status: "published",
          seo: {},
          data: {
            root: { props: {} },
            content: [
              {
                type: "Hero",
                props: { id: "h", cta: { kind: "page", pageId: "about", href: "/old/" } },
              },
            ],
          },
        },
        {
          id: "about",
          slug: "a-propos",
          title: "À propos",
          status: "published",
          seo: {},
          data: { root: { props: {} }, content: [] },
        },
        {
          id: "wip",
          slug: "brouillon",
          title: "WIP",
          status: "draft",
          seo: {},
          data: { root: { props: {} }, content: [] },
        },
      ],
    });
    expect(snapshot.pages.map((page) => page.id)).toEqual(["home", "about"]);
    expect((snapshot.pages[0]!.data.content[0]!.props.cta as { href: string }).href).toBe(
      "/a-propos/",
    );
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot))).releaseId).toBe("r1");
  });

  it("rejects duplicated slugs", () => {
    const page = {
      slug: "x",
      title: "X",
      status: "published" as const,
      seo: {},
      data: { root: { props: {} }, content: [] },
    };
    expect(() =>
      createSnapshot({
        releaseId: "r",
        settings,
        pages: [
          { id: "a", ...page },
          { id: "b", ...page },
        ],
      }),
    ).toThrow(SnapshotError);
  });
});

describe("validation", () => {
  it("accepts a valid config", () => {
    expect(validateConfig(config).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("flags missing defaults (OF-105) and invalid names (OF-203)", () => {
    const bad = defineConfig({
      site: { name: "" },
      components: {
        hero: {
          fields: { title: { type: "text" } },
          defaultProps: {},
          render: () => null as never,
        },
      },
    });
    const rules = validateConfig(bad).map((issue) => issue.rule);
    expect(rules).toContain("OF-105");
    expect(rules.filter((rule) => rule === "OF-203").length).toBe(2);
  });

  it("validates page data against fields (OF-201)", () => {
    const issues = validatePageData(
      {
        root: { props: {} },
        content: [
          { type: "Unknown", props: { id: "u" } },
          { type: "Hero", props: { id: "h", title: 3, image: { src: "x" }, variant: "blue" } },
          { type: "Cards", props: { id: "c", items: [{ label: 1 }] } },
        ],
      } as never,
      config,
    );
    expect(issues.filter((issue) => issue.severity === "error")).toHaveLength(5);
  });
});

describe("seed", () => {
  it("loads seed files and builds a snapshot", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "openflow-seed-"));
    await mkdir(path.join(dir, "openflow/seed/pages"), { recursive: true });
    await writeFile(
      path.join(dir, "openflow/seed/settings.json"),
      JSON.stringify({ site: { url: "https://exemple.fr" } }),
    );
    await writeFile(
      path.join(dir, "openflow/seed/pages/accueil.json"),
      JSON.stringify({
        slug: "",
        title: "Accueil",
        data: { root: { props: {} }, content: [{ type: "Hero", props: { title: "Salut" } }] },
      }),
    );
    await writeFile(path.join(dir, "openflow/seed/pages/Bad Name.json"), "{}");
    const { seed, issues } = await loadSeed(dir, config);
    expect(issues.map((issue) => issue.rule)).toEqual(["OF-201"]);
    expect(seed?.settings.site).toMatchObject({ name: "Test", url: "https://exemple.fr" });
    expect(seed?.pages[0]).toMatchObject({ id: "accueil", status: "published" });
    await writeFile(path.join(dir, "openflow/seed/pages/Bad Name.json"), "");
    await expect(snapshotFromSeed(dir, config)).rejects.toThrow(/Seed invalide/);
  });
});
