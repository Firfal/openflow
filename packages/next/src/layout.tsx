import { buildThemeCss, type OpenFlowConfig } from "@openflow/core";
import type { ReactNode } from "react";
import { OpenFlowAnalytics } from "./analytics.js";
import { getSettings, getSite, getSnapshot, getTheme } from "./snapshot.js";

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
    const [settings, site, theme, snapshot] = await Promise.all([
      getSettings(config),
      getSite(config),
      getTheme(config),
      getSnapshot(config),
    ]);
    const recaptchaKey = snapshot.integrations?.recaptchaSiteKey;
    // Theme tokens chosen by the owner (Réglages > Thème), hoisted into <head> by React.
    const css = buildThemeCss(theme);
    return (
      <>
        {css && (
          <style href="openflow-theme" precedence="openflow">
            {css}
          </style>
        )}
        {/* reCAPTCHA key of the forms (loaded only when a visitor starts filling one). */}
        {recaptchaKey && <meta name="openflow-recaptcha" content={recaptchaKey} />}
        {Layout ? (
          <Layout settings={settings} site={site}>
            {children}
          </Layout>
        ) : (
          children
        )}
        {site.gaMeasurementId && <OpenFlowAnalytics measurementId={site.gaMeasurementId} />}
      </>
    );
  };
}
