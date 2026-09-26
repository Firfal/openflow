import type { ComponentConfig, Fields } from "@puckeditor/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  collectEditablePaths,
  imageField,
  imageProps,
  linkField,
  markComponent,
  markProps,
  prepareRenderConfig,
} from "../src/index.js";

const fields = {
  title: { type: "text", contentEditable: true },
  intro: { type: "textarea", contentEditable: true },
  code: { type: "text", metadata: { openflowInline: false } },
  anchor: { type: "text" },
  body: { type: "richtext" },
  image: imageField(),
  link: linkField(),
  items: {
    type: "array",
    arrayFields: {
      question: { type: "text", contentEditable: true },
      photo: imageField(),
      tags: { type: "array", arrayFields: { label: { type: "text", contentEditable: true } } },
    },
  },
  meta: { type: "object", objectFields: { caption: { type: "text", contentEditable: true } } },
} as unknown as Fields;

const html = (node: unknown) => renderToStaticMarkup(node as any);

describe("element markers", () => {
  it("lists the editable paths of a component", () => {
    expect(collectEditablePaths(fields)).toEqual([
      { path: "title", kind: "text" },
      { path: "intro", kind: "text" },
      { path: "body", kind: "richtext" },
      { path: "image", kind: "image" },
      { path: "items.question", kind: "text" },
      { path: "items.photo", kind: "image" },
      { path: "items.tags.label", kind: "text" },
      { path: "meta.caption", kind: "text" },
    ]);
  });

  it("wraps editable texts, keeps other values and never mutates the input", () => {
    const props = {
      id: "S-1",
      title: "Bonjour",
      intro: "",
      code: "npx x",
      anchor: "faq",
      link: { kind: "url", href: "https://x.fr" },
      items: [{ question: "Q1", tags: [{ label: "a" }, { label: "b" }] }, { question: "Q2" }],
      meta: { caption: "Légende" },
    };
    const snapshot = JSON.stringify(props);
    const marked = markProps(fields, props) as any;
    expect(JSON.stringify(props)).toBe(snapshot);
    expect(html(marked.title)).toBe('<span data-of="title">Bonjour</span>');
    // Empty values stay falsy so `{intro && <p>…</p>}` keeps working.
    expect(marked.intro).toBe("");
    expect(marked.code).toBe("npx x");
    expect(marked.anchor).toBe("faq");
    expect(marked.link).toEqual(props.link);
    expect(html(marked.items[1].question)).toBe(
      '<span data-of="items.question" data-of-i="1">Q2</span>',
    );
    expect(html(marked.items[0].tags[1].label)).toBe(
      '<span data-of="items.tags.label" data-of-i="0.1">b</span>',
    );
    expect(html(marked.meta.caption)).toBe('<span data-of="meta.caption">Légende</span>');
  });

  it("tags images so imageProps emits data-of", () => {
    const marked = markProps(fields, {
      image: { src: "/a.jpg", alt: "A" },
      items: [{ question: "", photo: { src: "/b.jpg", alt: "" } }],
    }) as any;
    expect(imageProps(marked.image)).toMatchObject({ src: "/a.jpg", "data-of": "image" });
    expect(imageProps(marked.items[0].photo)).toMatchObject({
      "data-of": "items.photo",
      "data-of-i": "0",
    });
    expect(markProps(fields, { image: null }).image).toBeNull();
    expect(imageProps({ src: "/a.jpg", alt: "" })).not.toHaveProperty("data-of");
  });

  it("wraps a section in data-of-s and renders it through the marked props", () => {
    const Hero: ComponentConfig<any> = {
      fields,
      render: ({ title, intro }: any) =>
        createElement(
          "section",
          null,
          createElement("h2", null, title),
          intro && createElement("p", null, intro),
        ),
    };
    const out = html(
      createElement(markComponent(Hero).render as any, { id: "Hero-1", title: "T", intro: "" }),
    );
    expect(out).toBe(
      '<div data-of-s="Hero-1" style="display:contents"><section><h2><span data-of="title">T</span></h2></section></div>',
    );
    const config = prepareRenderConfig({ components: { Hero } });
    expect(config.components.Hero.render).not.toBe(Hero.render);
  });
});
