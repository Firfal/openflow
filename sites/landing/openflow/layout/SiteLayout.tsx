import type { LayoutProps } from "@openflow/core";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import type { SiteSettingsValues } from "./settings";

/** Frame of every page, shared by the published site and the admin editor. */
export function SiteLayout({ settings, site, children }: LayoutProps<SiteSettingsValues>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader settings={settings} siteName={site.name} />
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <SiteFooter settings={settings} siteName={site.name} />
    </div>
  );
}
