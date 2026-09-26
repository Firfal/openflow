import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
  breakpointForWidth,
  buildPageCss,
  buildThemeCss,
  createSnapshot,
  type OpenFlowConfig,
  sanitizePageStyles,
  sanitizeStyle,
  sanitizeTheme,
  validateConfig,
  validatePageData,
} from "../src/index.js";

const page = (props: Record<string, unknown>, nested?: Record<string, unknown>): Data =>
  ({
    root: { props: {} },
    content: [
      {
        type: "Hero",
        props: {
          id: "hero",
          ...props,
          ...(nested ? { children: [{ type: "Card", props: { id: "card", ...nested } }] } : {}),
        },
      },
    ],
  }) as Data;

describe("free style", () => {
  it("maps a width to its screen", () => {
    expect(breakpointForWidth(1280)).toBe("base");
    expect(breakpointForWidth(1024)).toBe("base");
    expect(breakpointForWidth(1023)).toBe("tablet");
    expect(breakpointForWidth(768)).toBe("tablet");
    expect(breakpointForWidth(767)).toBe("mobile");
    expect(breakpointForWidth(390)).toBe("mobile");
  });

  it("builds section and element rules, smaller screens last", () => {
    const css = buildPageCss(
      page({
        _style: {
          section: { base: { paddingTop: "96px" }, mobile: { paddingTop: "48px" } },
          fields: {
            title: { base: { color: "#ff0000", fontSize: "56px", textAlign: "center" } },
            image: { tablet: { borderRadius: "24px" } },
          },
        },
      }),
    );
    expect(css).toMatchInlineSnapshot(`
      "[data-of-s="hero"]>*{padding-top:96px}
      [data-of-s="hero"] :is(img,video)[data-of="title"]:not([data-of-s="hero"] [data-of-s] *),[data-of-s="hero"] :not(img,video)[data-of="title"]:not([data-of-s="hero"] [data-of-s] *){color:#ff0000;font-size:56px}
      [data-of-s="hero"] :is(img,video)[data-of="title"]:not([data-of-s="hero"] [data-of-s] *),[data-of-s="hero"] :has(>:not(img,video)[data-of="title"]):not([data-of-s="hero"] [data-of-s] *){text-align:center}
      @media (max-width:1023.98px){[data-of-s="hero"] :is(img,video)[data-of="image"]:not([data-of-s="hero"] [data-of-s] *),[data-of-s="hero"] :has(>:not(img,video)[data-of="image"]):not([data-of-s="hero"] [data-of-s] *){border-radius:24px}}
      @media (max-width:767.98px){[data-of-s="hero"]>*{padding-top:48px}}"
    `);
  });

  it("composes a background image with its veil", () => {
    const css = buildPageCss(
      page({
        _style: {
          section: {
            base: {
              backgroundImage:
                "https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media&token=1",
              overlayColor: "#000000",
              overlayOpacity: 0.4,
            },
          },
        },
      }),
    );
    expect(css).toContain(
      'background-image:linear-gradient(color-mix(in srgb,#000000 40%,transparent),color-mix(in srgb,#000000 40%,transparent)),url("https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media&token=1")',
    );
    expect(css).toContain("background-size:cover");
  });

  it("rejects anything that could escape a declaration", () => {
    const attempts = [
      { color: "red;}body{display:none" },
      { color: "#fff</style><script>alert(1)</script>" },
      { backgroundImage: "javascript:alert(1)" },
      { backgroundImage: '/a.jpg")' },
      { backgroundImage: "/a.jpg) , url(https://evil" },
      { backgroundImage: "data:image/svg+xml,<svg onload=alert(1)>" },
      { fontFamily: "Arial; } * { color: red" },
      { fontSize: "12px;color:red" },
      { fontSize: "expression(alert(1))" },
      { paddingTop: "-10px" },
      { opacity: 2 },
      { fontWeight: 450 },
      { textAlign: "center;x" },
    ];
    for (const values of attempts) {
      expect(sanitizeStyle({ section: { base: values } })).toBeUndefined();
      expect(buildPageCss(page({ _style: { section: { base: values } } }))).toBe("");
    }
    // Unsafe ids and paths never reach a selector.
    expect(
      buildPageCss({
        root: { props: {} },
        content: [
          { type: "X", props: { id: 'a"]{}*{', _style: { section: { base: { opacity: 1 } } } } },
        ],
      } as Data),
    ).toBe("");
    expect(
      sanitizeStyle({
        fields: { 'a"]': { base: { color: "#fff" } }, ok: { base: { color: "#fff" } } },
      }),
    ).toEqual({ fields: { ok: { base: { color: "#fff" } } } });
  });

  it("keeps the valid properties of a partly invalid style", () => {
    expect(
      sanitizeStyle({
        section: { base: { paddingTop: "40px", color: "url(x)" }, phone: { color: "#fff" } },
        other: 1,
      }),
    ).toEqual({ section: { base: { paddingTop: "40px" } } });
    const data = page({ _style: { section: { base: { color: "nope" } } } });
    const clean = sanitizePageStyles(data);
    expect(clean.content[0]?.props).not.toHaveProperty("_style");
    expect(data.content[0]?.props).toHaveProperty("_style");
  });

  it("scopes element rules to their own section (not nested ones)", () => {
    const css = buildPageCss(
      page(
        { _style: { fields: { title: { base: { color: "#111111" } } } } },
        {
          _style: { fields: { title: { base: { color: "#222222" } } } },
        },
      ),
    );
    expect(css).toContain(':not([data-of-s="hero"] [data-of-s] *)');
    expect(css).toContain('[data-of-s="card"] :not(img,video)[data-of="title"]');
  });

  it("keeps hidden elements selectable (faded) in the editor", () => {
    const data = page({ _style: { section: { mobile: { hidden: true } } } });
    expect(buildPageCss(data)).toContain("display:none");
    const editing = buildPageCss(data, { editing: true });
    expect(editing).not.toContain("display:none");
    expect(editing).toContain("opacity:0.35");
    // Hidden on the tablet, shown again on mobile.
    const back = buildPageCss(
      page({ _style: { section: { tablet: { hidden: true }, mobile: { hidden: false } } } }),
    );
    expect(back).toContain(
      '@media (max-width:767.98px){[data-of-s="hero"]>*{display:revert-layer}}',
    );
  });
});

describe("theme", () => {
  it("emits valid tokens only, in a stable order", () => {
    const values = {
      "font-display": "var(--font-archivo)",
      "color-ink": "#101820",
      "color-bad": "red;}",
      "font-evil": "x;}",
      background: "#fff",
    };
    expect(sanitizeTheme(values)).toEqual({
      "color-ink": "#101820",
      "font-display": "var(--font-archivo)",
    });
    expect(buildThemeCss(values)).toBe(
      ":root{--color-ink:#101820;--font-display:var(--font-archivo)}",
    );
    expect(buildThemeCss(undefined)).toBe("");
  });
});

describe("style in the content model", () => {
  const config = {
    site: { name: "Test" },
    components: {
      Hero: {
        fields: { title: { type: "text", contentEditable: true } },
        defaultProps: { title: "T" },
        render: () => null,
      },
    },
  } as unknown as OpenFlowConfig;

  it("reserves field names starting with _ (OF-203)", () => {
    const bad = {
      ...config,
      components: {
        Hero: {
          ...config.components.Hero,
          fields: { _style: { type: "text" } },
          defaultProps: { _style: "" },
        },
      },
    } as unknown as OpenFlowConfig;
    expect(validateConfig(bad).map((issue) => issue.rule)).toContain("OF-203");
    expect(validateConfig(config)).toEqual([]);
  });

  it("accepts a valid _style and warns about invalid values (OF-201)", () => {
    const valid = page({ title: "T", _style: { section: { base: { paddingTop: "40px" } } } });
    expect(validatePageData(valid, config)).toEqual([]);
    const invalid = page({ title: "T", _style: { section: { base: { color: "red;}" } } } });
    expect(validatePageData(invalid, config)).toMatchObject([
      { rule: "OF-201", severity: "warning" },
    ]);
  });

  it("sanitizes styles and theme when publishing", () => {
    const snapshot = createSnapshot({
      releaseId: "r1",
      settings: {
        site: { name: "Test", lang: "fr" },
        values: {},
        theme: { "color-ink": "#000000", "color-x": "url(x)" },
      },
      pages: [
        {
          id: "accueil",
          slug: "",
          title: "Accueil",
          status: "published",
          seo: {},
          data: page({ _style: { section: { base: { color: "#fff;}", paddingTop: "8px" } } } }),
        },
      ],
    });
    expect(snapshot.theme).toEqual({ "color-ink": "#000000" });
    expect(snapshot.pages[0]?.data.content[0]?.props._style).toEqual({
      section: { base: { paddingTop: "8px" } },
    });
  });
});
