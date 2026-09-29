import { buildThemeCss, type OpenFlowConfig } from "@openflow/core";
import type { ReactNode } from "react";
import { OpenFlowAnalytics } from "./analytics.js";
import { getSite, getSnapshot, getTheme } from "./snapshot.js";
import { OpenFlowStats } from "./stats.js";

/**
 * Creates the layout of the public pages (`app/(site)/layout.tsx`): the owner's theme tokens, the
 * audience measurement and Google Analytics. The site's frame (`config.layout`: header, footer)
 * is rendered by each page (`createOpenFlowPage`), in the page's language — the admin renders the
 * same component around the page being edited:
 *
 * ```tsx
 * export default createOpenFlowLayout(config);
 * ```
 */
export function createOpenFlowLayout(config: OpenFlowConfig) {
  return async function OpenFlowLayout({ children }: { children: ReactNode }) {
    const [site, theme, snapshot] = await Promise.all([
      getSite(config),
      getTheme(config),
      getSnapshot(config),
    ]);
    const recaptchaKey = snapshot.integrations?.recaptchaSiteKey;
    // Theme tokens chosen by the owner (« Couleurs et polices »), hoisted into <head> by React.
    const css = buildThemeCss(theme);
    return (
      <>
        {css && (
          <style href="openflow-theme" precedence="openflow">
            {css}
          </style>
        )}
        {/* reCAPTCHA key of the forms (loaded only when a visitor starts filling one). */}
        {recaptchaKey && <meta name="cms-recaptcha" content={recaptchaKey} />}
        {children}
        {site.gaMeasurementId && <OpenFlowAnalytics measurementId={site.gaMeasurementId} />}
        {/* Audience without cookies (Statistiques), unless the owner turned it off. */}
        {site.stats !== "off" && <OpenFlowStats />}
      </>
    );
  };
}
