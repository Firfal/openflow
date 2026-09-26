import type { OpenFlowConfig } from "@openflow/core";
import type { ReactNode } from "react";
import { getSettings, getSite } from "./snapshot.js";

/**
 * Creates the layout of the public pages (`app/(site)/layout.tsx`) from `config.layout`, fed with
 * the published settings — the admin renders the same component around the page being edited:
 *
 * ```tsx
 * export default createOpenFlowLayout(config);
 * ```
 */
export function createOpenFlowLayout(config: OpenFlowConfig) {
  return async function OpenFlowLayout({ children }: { children: ReactNode }) {
    const Layout = config.layout;
    if (!Layout) return <>{children}</>;
    const [settings, site] = await Promise.all([getSettings(config), getSite(config)]);
    return (
      <Layout settings={settings} site={site}>
        {children}
      </Layout>
    );
  };
}
