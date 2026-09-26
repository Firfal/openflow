import { buildThemeCss, type OpenFlowConfig } from "@openflow/core";
import type { ReactNode } from "react";
import { getSettings, getSite, getTheme } from "./snapshot.js";

/**
 * Creates the layout of the public pages (`app/(site)/layout.tsx`) from `config.layout`, fed with
 * the published settings, plus the owner's theme tokens — the admin renders the same component
 * around the page being edited:
 *
 * ```tsx
 * export default createOpenFlowLayout(config);
 * ```
 */
export function createOpenFlowLayout(config: OpenFlowConfig) {
  return async function OpenFlowLayout({ children }: { children: ReactNode }) {
    const Layout = config.layout;
    const [settings, site, theme] = await Promise.all([
      getSettings(config),
      getSite(config),
      getTheme(config),
    ]);
    // Theme tokens chosen by the owner (Réglages > Thème), hoisted into <head> by React.
    const css = buildThemeCss(theme);
    return (
      <>
        {css && (
          <style href="openflow-theme" precedence="openflow">
            {css}
          </style>
        )}
        {Layout ? (
          <Layout settings={settings} site={site}>
            {children}
          </Layout>
        ) : (
          children
        )}
      </>
    );
  };
}
