import { bookingComponentOf, type OpenFlowConfig } from "@openflow/core";
import type { Route } from "./context.js";
import type { IconName } from "./icons.js";

/** Groups of the sidebar: plain titles, never buttons. */
export type NavGroup = "Contenu" | "Activité" | "Réglages";

/**
 * One place of the dashboard. The sidebar and the ⌘K palette both read this list, so they use the
 * same words (the palette adds the keywords to its search).
 */
export interface NavEntry {
  id: string;
  label: string;
  icon: IconName;
  group: NavGroup;
  route: Route;
  /** Other words the owner may type in the palette. */
  keywords?: string;
}

/** Every place of the dashboard, in the sidebar's order. Views a site does not use are left out. */
export function navEntries(config: OpenFlowConfig): NavEntry[] {
  const collections = Object.entries(config.collections ?? {});
  return [
    {
      id: "pages",
      label: "Pages",
      icon: "fileText",
      group: "Contenu",
      route: { view: "pages" },
      keywords: "toutes les pages accueil",
    },
    ...collections.map(
      ([name, collection]): NavEntry => ({
        id: `collection:${name}`,
        label: collection.label,
        icon: collection.icon ?? "layers",
        group: "Contenu",
        route: { view: "collection", collection: name },
        keywords: "collection liste articles",
      }),
    ),
    {
      id: "media",
      label: "Médias",
      icon: "image",
      group: "Contenu",
      route: { view: "media" },
      keywords: "images vidéos médiathèque photos",
    },
    {
      id: "messages",
      label: "Messages",
      icon: "inbox",
      group: "Activité",
      route: { view: "messages" },
      keywords: "formulaire contact boîte de réception mail",
    },
    ...(bookingComponentOf(config.components)
      ? [
          {
            id: "bookings",
            label: "Rendez-vous",
            icon: "calendarCheck",
            group: "Activité",
            route: { view: "bookings" },
            keywords: "réservation agenda créneau planning",
          } satisfies NavEntry,
        ]
      : []),
    {
      id: "stats",
      label: "Statistiques",
      icon: "chart",
      group: "Activité",
      route: { view: "stats" },
      keywords:
        "audience visites visiteurs trafic sources analytics recherche google search console vitesse",
    },
    {
      id: "history",
      label: "Historique",
      icon: "history",
      group: "Activité",
      route: { view: "history" },
      keywords: "publications versions restaurer",
    },
    ...(config.theme
      ? [
          {
            id: "settings:theme",
            label: "Couleurs et polices",
            icon: "palette",
            group: "Réglages",
            route: { view: "settings", tab: "theme" },
            keywords: "thème couleur principale police typographie",
          } satisfies NavEntry,
        ]
      : []),
    {
      id: "settings:global",
      label: "Menu et pied de page",
      icon: "panelTop",
      group: "Réglages",
      route: { view: "settings", tab: "global" },
      keywords: "contenu commun en-tête logo navigation réseaux sociaux bas de page",
    },
    {
      id: "settings:business",
      label: "Établissement",
      icon: "store",
      group: "Réglages",
      route: { view: "settings", tab: "business" },
      keywords: "horaires ouverture fermeture adresse téléphone congés fiche google",
    },
    {
      id: "settings:legal",
      label: "Informations légales",
      icon: "shieldCheck",
      group: "Réglages",
      route: { view: "settings", tab: "legal" },
      keywords:
        "mentions légales politique de confidentialité rgpd cnil siret données personnelles cookies",
    },
    {
      id: "settings:site",
      label: "Site et référencement",
      icon: "globe",
      group: "Réglages",
      route: { view: "settings", tab: "site" },
      keywords: "nom adresse seo google analytics search console bing robots entraînement",
    },
    {
      id: "settings:languages",
      label: "Langues",
      icon: "languages",
      group: "Réglages",
      route: { view: "settings", tab: "languages" },
      keywords: "traduction traduire anglais multilingue",
    },
    {
      id: "assistant",
      label: "Assistant IA",
      icon: "sparkles",
      group: "Réglages",
      route: { view: "assistant" },
      keywords: "connecter une ia mcp claude chatgpt cursor clé connecteur",
    },
  ];
}

/** Is this entry the place shown now? (An editor opened from a list keeps that list current.) */
export function isCurrent(entry: NavEntry, route: Route): boolean {
  const target = entry.route;
  if (target.view !== route.view) return false;
  if (target.view === "collection" && route.view === "collection") {
    return target.collection === route.collection;
  }
  if (target.view === "settings" && route.view === "settings") {
    return target.tab === (route.tab ?? "global");
  }
  return true;
}
