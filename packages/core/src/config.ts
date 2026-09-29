import type { Config, Fields } from "@puckeditor/core";
import type { ComponentType, ReactElement, ReactNode } from "react";
import type { BusinessInfo } from "./business.js";

/**
 * Global, non-page content edited in the admin under « Menu et pied de page » (navigation, footer, contact…).
 * Values are available to the site layout via the snapshot (`snapshot.settings.values`).
 */
export interface SettingsConfig<Values extends object = Record<string, any>> {
  fields: Fields<Values & Record<string, any>> | Record<string, unknown>;
  defaultProps: Values;
  /**
   * Keys of `fields` about the look of the whole site (a colour palette…). When the config has a
   * `theme`, the admin shows them in « Couleurs et polices », with the theme's colours and fonts,
   * instead of « Menu et pied de page »: one place for the site's colours. Stored in the same
   * settings values either way.
   */
  appearance?: Array<keyof Values & string>;
  /**
   * Optional preview shown in the admin while editing settings. Deprecated: declare `layout` in
   * the config instead, the admin then previews the real header and footer.
   */
  preview?: (props: {
    values: Values;
    site: { name: string; lang?: string };
  }) => ReactElement | null;
}

/** Site-wide defaults, overridable by the owner in the admin ("Site et SEO"). */
export interface SiteDefaults {
  /** Site name, used in `<title>` templates and Open Graph. */
  name: string;
  /** Default language of the site (`<html lang>`). */
  lang?: string;
  /** Public URL of the site, used for canonical URLs and the sitemap. */
  url?: string;
  /** Default meta description. */
  description?: string;
}

/** Props of the site layout (header, footer, theme wrapper around the page sections). */
export interface LayoutProps<Values extends object = Record<string, any>> {
  /** Global settings values (defaults merged with the owner's values). */
  settings: Values;
  /** The site's identity, and its business profile (« Établissement ») when filled. */
  site: { name: string; lang?: string; url?: string; business?: BusinessInfo };
  /** The page sections. */
  children: ReactNode;
  /** True inside the admin editor. */
  editing?: boolean;
  /**
   * The site's languages for a language switcher (none when the site has one language): each
   * with its own name, the page in that language (or its home page), and the current one.
   */
  languages?: Array<{ lang: string; label: string; href: string; current: boolean }>;
  /** The home page in the page's language (`/`, `/en/`): the logo's link. */
  homeHref?: string;
}

/** A theme token editable by the owner (« Couleurs et polices »). */
export interface ThemeToken {
  /** Token name: `ink` for the colour variable `--color-ink`, `display` for `--font-display`. */
  token: string;
  /** Name shown to the owner (« Encre », « Police des titres »). */
  label: string;
  /** Current value in the site's CSS (a colour, or a font among `fontOptions`). */
  value: string;
}

/**
 * Theme tokens the owner may change. They override the site's CSS variables (Tailwind v4
 * `@theme` tokens) in `:root`, so every class using them follows (`bg-ink`, `font-display`…).
 */
export interface ThemeConfig {
  colors?: ThemeToken[];
  fonts?: ThemeToken[];
  /**
   * Fonts embedded in the site (e.g. `next/font` variables), offered for the font tokens and in
   * the style panel: `{ label: "Archivo", value: "var(--font-archivo)" }`.
   */
  fontOptions?: Array<{ label: string; value: string }>;
}

/** Editor options. */
export interface EditorOptions {
  /**
   * `free` (default): the owner can change the style of each section and element (Style tab).
   * `off`: content only.
   */
  styles?: "free" | "off";
}

/** Icons offered for a collection in the admin menu. */
export type CollectionIcon =
  | "newspaper"
  | "briefcase"
  | "calendar"
  | "users"
  | "star"
  | "tag"
  | "image"
  | "layers";

/**
 * A collection of similar items (articles, projects, events, team members…), each with its own
 * page at `/<path>/<item>/`. The agency codes the item's design once (`component`, a section of
 * `components`); the owner adds as many items as needed in the admin, and sections list them
 * (`getCollection(puck.metadata, name)`).
 */
export interface CollectionConfig {
  /** Name of the collection in the admin menu, plural: « Actualités », « Réalisations ». */
  label: string;
  /** Button creating an item: « Nouvel article » (default « Nouvel élément »). */
  addLabel?: string;
  /** Address prefix of the items: `actualites` gives `/actualites/mon-article/`. */
  path: string;
  /**
   * Section of `components` that shows one item (its page's main block). It is added to every new
   * item, can't be removed or duplicated, and is kept out of the section library.
   */
  component: string;
  /** Text field of `component` that holds the item's title (default `title`). */
  titleField?: string;
  /** `dateField()` of `component`: publication date, used to sort and in search results. */
  dateField?: string;
  /** Text field of `component` summarising the item (lists, Google and social previews). */
  descriptionField?: string;
  /** Image field of `component` illustrating the item (lists, social previews, admin list). */
  imageField?: string;
  /**
   * What the items are, for Google and AI assistants (schema.org structured data of each item's
   * page): `article` (default: news, blog posts, projects), `event` (workshops, open days,
   * concerts: `dateField` is the day it starts), `service` (a service offered, with its price) or
   * `product`.
   */
  kind?: "article" | "event" | "service" | "product";
  /** Events: `dateField()` of the last day, for events over several days. */
  endDateField?: string;
  /** Events: text field of the start time (« 10:00 », « 14 h 30 »). */
  timeField?: string;
  /** Events: text field of the place; the business address (Établissement) by default. */
  locationField?: string;
  /** Events, services, products: text or number field of the price (« 25 », « 12,50 € », « Gratuit »). */
  priceField?: string;
  /**
   * Order of the items: newest first (`date`, default with a `dateField`), by `title`, or
   * `upcoming` (default for events: coming events first, the soonest first, then past ones).
   */
  sort?: "date" | "title" | "upcoming";
  /** Icon in the admin menu (default `layers`). */
  icon?: CollectionIcon;
}

/**
 * OpenFlow configuration of a site: a Puck config (sections = components) plus global settings.
 * The same object is used by the public renderer and by the admin editor.
 */
export type OpenFlowConfig = Config & {
  site: SiteDefaults;
  // Settings values are typed by each site (`SettingsConfig<MyValues>`).
  settings?: SettingsConfig<any>;
  /**
   * Header, footer and theme wrapper around the sections. Used by the published site
   * (`createOpenFlowLayout`) and by the admin, so the owner edits pages in their real frame.
   */
  layout?: ComponentType<LayoutProps<any>>;
  /** Theme tokens (colours, fonts) the owner can change in « Couleurs et polices ». */
  theme?: ThemeConfig;
  editor?: EditorOptions;
  /** Collections, by name (stable, stored with each item): `{ actualites: { … } }`. */
  collections?: Record<string, CollectionConfig>;
};

/** Identity helper giving type-checking and autocompletion for `openflow.config.tsx`. */
export function defineConfig<T extends OpenFlowConfig>(config: T): T {
  return config;
}

/** Identity helper for a collection declared apart from `defineConfig`. */
export function defineCollection(collection: CollectionConfig): CollectionConfig {
  return collection;
}

/** Extracts the plain Puck config (components, categories, root) from an OpenFlow config. */
export function toPuckConfig(config: OpenFlowConfig): Config {
  const { components, categories, root } = config;
  return { components, categories, root } as Config;
}
