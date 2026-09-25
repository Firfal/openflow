import { getSettings, getSite } from "@openflow/next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/openflow/layout/SiteFooter";
import { SiteHeader } from "@/openflow/layout/SiteHeader";
import type { SiteSettingsValues } from "@/openflow/layout/settings";
import config from "@/openflow.config";

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const [settings, site] = await Promise.all([
    getSettings<SiteSettingsValues>(config),
    getSite(config),
  ]);
  return (
    <div data-theme={settings.theme} className="flex min-h-dvh flex-col">
      <SiteHeader settings={settings} siteName={site.name} />
      <main className="flex-1">{children}</main>
      <SiteFooter settings={settings} siteName={site.name} />
    </div>
  );
}
