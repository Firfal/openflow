import type { LayoutProps } from "@openflow/core";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import type { SiteSettingsValues } from "./settings";

/**
 * Frame of every page (header, footer, theme colour), shared by the published site and the admin
 * editor: the owner edits each page inside its real frame.
 */
export function SiteLayout({ settings, site, children }: LayoutProps<SiteSettingsValues>) {
  return (
    <div data-theme={settings.theme} className="flex min-h-dvh flex-col">
      <SiteHeader settings={settings} siteName={site.name} />
      <main className="flex-1">{children}</main>
      <SiteFooter settings={settings} siteName={site.name} />
    </div>
  );
}
