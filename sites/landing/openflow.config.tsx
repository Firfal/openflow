import { defineConfig } from "@openflow/core";
import { Architecture } from "./openflow/components/Architecture";
import { ClosingCta } from "./openflow/components/ClosingCta";
import { Comparison } from "./openflow/components/Comparison";
import { Faq } from "./openflow/components/Faq";
import { GetStarted } from "./openflow/components/GetStarted";
import { HeroEditor } from "./openflow/components/HeroEditor";
import { Showcase } from "./openflow/components/Showcase";
import { StandardTerminal } from "./openflow/components/StandardTerminal";
import { Steps } from "./openflow/components/Steps";
import { SiteFooter } from "./openflow/layout/SiteFooter";
import { SiteHeader } from "./openflow/layout/SiteHeader";
import {
  type SiteSettingsValues,
  settingsDefaults,
  settingsFields,
} from "./openflow/layout/settings";

/**
 * The OpenFlow landing page is itself an OpenFlow site: every word below is editable in /admin.
 * Design plan: DESIGN.md.
 */
export default defineConfig({
  site: {
    name: "OpenFlow",
    lang: "fr",
    description:
      "Le CMS visuel open source pour les sites Next.js créés avec Claude Code, 100 % Firebase.",
  },
  categories: {
    header: { title: "En-têtes", components: ["HeroEditor"] },
    story: { title: "Présentation", components: ["Steps", "Showcase", "StandardTerminal"] },
    tech: { title: "Technique", components: ["Architecture", "Comparison", "GetStarted"] },
    closing: { title: "Fin de page", components: ["Faq", "ClosingCta"] },
  },
  components: {
    HeroEditor,
    Steps,
    Showcase,
    StandardTerminal,
    Architecture,
    Comparison,
    GetStarted,
    Faq,
    ClosingCta,
  },
  settings: {
    fields: settingsFields,
    defaultProps: settingsDefaults,
    preview: ({ values, site }) => {
      const settings = values as SiteSettingsValues;
      return (
        <div>
          <SiteHeader settings={settings} siteName={site.name} />
          <div className="bg-calque h-72" />
          <SiteFooter settings={settings} siteName={site.name} />
        </div>
      );
    },
  },
});
