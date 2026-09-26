import { defineConfig } from "@openflow/core";
import { CallToAction } from "./openflow/components/CallToAction";
import { Faq } from "./openflow/components/Faq";
import { Features } from "./openflow/components/Features";
import { Hero } from "./openflow/components/Hero";
import { Testimonials } from "./openflow/components/Testimonials";
import { TextImage } from "./openflow/components/TextImage";
import { SiteLayout } from "./openflow/layout/SiteLayout";
import { settingsDefaults, settingsFields } from "./openflow/layout/settings";

/**
 * OpenFlow configuration: shared by the public site (static export) and the admin (/admin).
 * Every section declares its editable fields — see AGENTS.md and the OpenFlow Standard (OFS).
 */
export default defineConfig({
  site: {
    name: "Mon entreprise",
    lang: "fr",
    description: "Présentation de l'entreprise en une phrase.",
  },
  categories: {
    header: { title: "En-têtes", components: ["Hero"] },
    content: { title: "Contenu", components: ["TextImage", "Features", "Testimonials", "Faq"] },
    conversion: { title: "Conversion", components: ["CallToAction"] },
  },
  components: { Hero, TextImage, Features, Testimonials, Faq, CallToAction },
  settings: {
    fields: settingsFields,
    defaultProps: settingsDefaults,
  },
  layout: SiteLayout,
});
