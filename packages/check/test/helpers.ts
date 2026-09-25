import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIRESTORE_RULES_FILE, STORAGE_RULES_FILE } from "@openflow/core";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Temporary sites live inside the package so that `react`, `@puckeditor/core`… resolve. */
export const TMP = path.join(here, ".tmp");

export const FIREBASE_JSON = {
  hosting: {
    public: "out",
    rewrites: [{ source: "/admin/**", destination: "/admin/index.html" }],
  },
  firestore: { rules: "firestore.rules" },
  storage: { rules: "storage.rules" },
};

export const NEXT_CONFIG = `const config = { output: "export", trailingSlash: true, images: { unoptimized: true } };
export default config;
`;

export const GOOD_HERO = `import { imageField, imageProps, linkField, linkProps } from "@openflow/core";

export const Hero = {
  label: "En-tête",
  fields: {
    title: { type: "text", contentEditable: true },
    body: { type: "richtext" },
    image: imageField({ label: "Image" }),
    cta: linkField({ label: "Lien" }),
    ctaLabel: { type: "text", contentEditable: true },
    items: {
      type: "array",
      arrayFields: { label: { type: "text", contentEditable: true } },
      defaultItemProps: { label: "Point fort" },
    },
  },
  defaultProps: {
    title: "Bienvenue",
    body: "<p>Du pain tous les jours.</p>",
    image: null,
    cta: null,
    ctaLabel: "Découvrir",
    items: [{ label: "Bio" }],
  },
  render: ({ title, body, image, cta, ctaLabel, items }) => {
    const img = imageProps(image);
    return (
      <section>
        <h1>{title}</h1>
        <div>{body}</div>
        {img && <img {...img} />}
        <a {...linkProps(cta)}>{ctaLabel}</a>
        <ul>{items?.map((item, i) => <li key={i}>{item.label}</li>)}</ul>
        <svg viewBox="0 0 10 10"><title>Icône</title></svg>
      </section>
    );
  },
};
`;

export const GOOD_CONFIG = `import { defineConfig } from "@openflow/core";
import { Hero } from "./openflow/components/Hero";

export default defineConfig({
  site: { name: "Boulangerie", lang: "fr" },
  components: { Hero },
  settings: {
    fields: { footer: { type: "text" } },
    defaultProps: { footer: "© Boulangerie" },
  },
});
`;

export const GOOD_SEED = {
  slug: "",
  title: "Accueil",
  seo: { title: "Accueil", description: "Boulangerie artisanale" },
  data: { root: { props: {} }, content: [{ type: "Hero", props: { id: "hero", title: "Salut" } }] },
};

export type SiteFiles = Record<string, string | object>;

/** Writes a complete, compliant site then applies `overrides` (a `null` value deletes a file). */
export async function makeSite(
  name: string,
  overrides: Record<string, string | object | null> = {},
) {
  const dir = path.join(TMP, name);
  await rm(dir, { recursive: true, force: true });
  const files: Record<string, string | object | null> = {
    "openflow.config.tsx": GOOD_CONFIG,
    "openflow/components/Hero.tsx": GOOD_HERO,
    "openflow/seed/pages/accueil.json": GOOD_SEED,
    "openflow/seed/settings.json": { site: {}, values: {} },
    "firebase.json": FIREBASE_JSON,
    "firestore.rules": FIRESTORE_RULES_FILE,
    "storage.rules": STORAGE_RULES_FILE,
    "next.config.ts": NEXT_CONFIG,
    ...overrides,
  };
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}
