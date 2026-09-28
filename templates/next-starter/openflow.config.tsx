import { defineConfig } from "@openflow/core";
import { Article } from "./openflow/components/Article";
import { ArticleList } from "./openflow/components/ArticleList";
import { CallToAction } from "./openflow/components/CallToAction";
import { ContactForm } from "./openflow/components/ContactForm";
import { Event } from "./openflow/components/Event";
import { EventList } from "./openflow/components/EventList";
import { Faq } from "./openflow/components/Faq";
import { Features } from "./openflow/components/Features";
import { Hero } from "./openflow/components/Hero";
import { Legal } from "./openflow/components/Legal";
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
    content: {
      title: "Contenu",
      components: ["TextImage", "Features", "Testimonials", "Faq", "ArticleList", "EventList"],
    },
    conversion: { title: "Conversion", components: ["CallToAction", "ContactForm"] },
    legal: { title: "Pages légales", components: ["Legal"] },
  },
  components: {
    Hero,
    TextImage,
    Features,
    Testimonials,
    Faq,
    ArticleList,
    CallToAction,
    ContactForm,
    Article,
    EventList,
    Event,
    Legal,
  },
  // News items: each one has its page at /actualites/<titre>/, written in the admin
  // (menu « Actualités »); « Liste d'actualités » shows the latest ones. Same for events.
  collections: {
    actualites: {
      label: "Actualités",
      addLabel: "Nouvel article",
      path: "actualites",
      component: "Article",
      dateField: "date",
      descriptionField: "excerpt",
      imageField: "cover",
      icon: "newspaper",
    },
    // Events (workshops, open days…): Google and AI assistants read their day, place and price
    // (schema.org Event); « Agenda des événements » lists the coming ones.
    evenements: {
      label: "Événements",
      addLabel: "Nouvel événement",
      path: "evenements",
      component: "Event",
      kind: "event",
      dateField: "date",
      endDateField: "endDate",
      timeField: "time",
      locationField: "place",
      priceField: "price",
      descriptionField: "excerpt",
      imageField: "cover",
      icon: "calendar",
    },
  },
  settings: {
    fields: settingsFields,
    defaultProps: settingsDefaults,
  },
  layout: SiteLayout,
  // Réglages > Thème: variables of app/globals.css the owner can set.
  theme: {
    colors: [
      {
        token: "brand",
        label: "Couleur principale personnalisée (remplace la couleur choisie dans Contenu commun)",
        value: "#b45309",
      },
    ],
    fonts: [{ token: "body", label: "Police du site", value: "system-ui" }],
  },
});
