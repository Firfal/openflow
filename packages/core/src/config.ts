import type { Config, Fields } from "@puckeditor/core";
import type { ComponentType, ReactElement, ReactNode } from "react";

/**
 * Global, non-page content edited in the admin under "Réglages" (navigation, footer, contact…).
 * Values are available to the site layout via the snapshot (`snapshot.settings.values`).
 */
export interface SettingsConfig<Values extends object = Record<string, any>> {
  fields: Fields<Values & Record<string, any>> | Record<string, unknown>;
  defaultProps: Values;
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
  site: { name: string; lang?: string };
  /** The page sections. */
  children: ReactNode;
  /** True inside the admin editor. */
  editing?: boolean;
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
};

/** Identity helper giving type-checking and autocompletion for `openflow.config.tsx`. */
export function defineConfig<T extends OpenFlowConfig>(config: T): T {
  return config;
}

/** Extracts the plain Puck config (components, categories, root) from an OpenFlow config. */
export function toPuckConfig(config: OpenFlowConfig): Config {
  const { components, categories, root } = config;
  return { components, categories, root } as Config;
}
