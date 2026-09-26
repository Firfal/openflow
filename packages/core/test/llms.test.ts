import { describe, expect, it } from "vitest";
import {
  buildLlmsFullTxt,
  buildLlmsTxt,
  createSnapshot,
  defineConfig,
  htmlToMarkdown,
  imageField,
  linkField,
  pageText,
} from "../src/index.js";

const config = defineConfig({
  site: { name: "Boulangerie Dupont", lang: "fr" },
  components: {
    Hero: {
      fields: {
        title: { type: "text", contentEditable: true },
        body: { type: "richtext" },
        image: imageField(),
        cta: linkField(),
        tone: {
          type: "radio",
          options: [
            { label: "Clair", value: "light" },
            { label: "Sombre", value: "dark" },
          ],
        },
      },
      defaultProps: { title: "Bienvenue", body: "", image: null, cta: null, tone: "light" },
      render: () => null as never,
    },
    Faq: {
      fields: {
        items: {
          type: "array",
          arrayFields: { question: { type: "text" }, answer: { type: "textarea" } },
        },
      },
      defaultProps: { items: [] },
      render: () => null as never,
    },
  },
});

const snapshot = createSnapshot({
  releaseId: "r1",
  createdAt: "2026-09-26T00:00:00.000Z",
  settings: {
    site: {
      name: "Boulangerie Dupont",
      lang: "fr",
      url: "https://boulangerie.example",
      description: "Pain au levain, cuit ce matin.",
    },
    values: {},
  },
  pages: [
    {
      id: "accueil",
      slug: "",
      title: "Accueil",
      status: "published",
      seo: { description: "Notre boulangerie à Lyon." },
      data: {
        root: { props: {} },
        content: [
          {
            type: "Hero",
            props: {
              id: "h1",
              title: "Le bon pain",
              body: "<p>Du <strong>levain</strong> &amp; du temps.</p><ul><li>Bio</li><li>Local</li></ul>",
              image: { src: "https://x/y.jpg", alt: "Une miche dorée" },
              tone: "dark",
            },
          },
          {
            type: "Faq",
            props: {
              id: "f1",
              items: [
                { question: "Ouvert le dimanche ?", answer: "Oui, de 7 h à 13 h." },
                { question: "Livrez-vous ?", answer: "Non." },
              ],
            },
          },
        ],
      },
    },
    {
      id: "brouillon",
      slug: "brouillon",
      title: "Brouillon",
      status: "draft",
      seo: {},
      data: { root: { props: {} }, content: [] },
    },
    {
      id: "mentions",
      slug: "mentions-legales",
      title: "Mentions légales",
      status: "published",
      seo: { noindex: true },
      data: { root: { props: {} }, content: [] },
    },
  ],
});

describe("llms.txt", () => {
  it("turns rich text into simple Markdown", () => {
    expect(
      htmlToMarkdown('<p>Un <em>très</em> <a href="/a/">lien</a><br>ici</p><h2>Titre</h2>'),
    ).toBe("Un *très* [lien](/a/)\nici\n\n### Titre");
  });

  it("extracts the text of a page, without choices, links or style", () => {
    const text = pageText(snapshot.pages[0]!.data, config);
    expect(text).toContain("Le bon pain");
    expect(text).toContain("Du **levain** & du temps.");
    expect(text).toContain("[Image : Une miche dorée]");
    expect(text).toContain(
      "- **Ouvert le dimanche ?** : Oui, de 7 h à 13 h.\n- **Livrez-vous ?** : Non.",
    );
    expect(text).not.toContain("dark");
  });

  it("lists the indexed published pages", () => {
    const txt = buildLlmsTxt(snapshot);
    expect(txt).toMatch(/^# Boulangerie Dupont\n\n> Pain au levain, cuit ce matin\.\n/);
    expect(txt).toContain("- [Accueil](https://boulangerie.example/): Notre boulangerie à Lyon.");
    expect(txt).toContain("(https://boulangerie.example/llms-full.txt)");
    expect(txt).not.toContain("Brouillon");
    expect(txt).not.toContain("Mentions");
  });

  it("gives the full text of every page", () => {
    const full = buildLlmsFullTxt(snapshot, config);
    expect(full).toContain(
      "## Accueil\n\nURL : https://boulangerie.example/\n\n> Notre boulangerie à Lyon.",
    );
    expect(full).toContain("Oui, de 7 h à 13 h.");
    expect(full).not.toContain("Mentions");
  });
});
