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
import { SiteLayout } from "./openflow/layout/SiteLayout";
import { settingsDefaults, settingsFields } from "./openflow/layout/settings";

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
  },
  layout: SiteLayout,
  // Tokens of app/globals.css the owner can change (Réglages > Thème).
  theme: {
    colors: [
      { token: "ink", label: "Encre (fonds sombres, texte)", value: "#0f1e33" },
      { token: "paper", label: "Papier (fond clair)", value: "#eef1f6" },
      { token: "cobalt", label: "Cobalt (boutons, liens)", value: "#2f5bff" },
      { token: "flame", label: "Flamme (accents)", value: "#ff7a1a" },
      { token: "graphite", label: "Graphite (texte secondaire)", value: "#4a5568" },
      { token: "line", label: "Filets et bordures", value: "#d5dce7" },
    ],
    fonts: [
      { token: "display", label: "Police des titres", value: "var(--font-bricolage)" },
      { token: "sans", label: "Police du texte", value: "var(--font-plex)" },
    ],
    fontOptions: [
      { label: "Bricolage Grotesque", value: "var(--font-bricolage)" },
      { label: "IBM Plex Sans", value: "var(--font-plex)" },
      { label: "JetBrains Mono", value: "var(--font-jetbrains)" },
    ],
  },
});
