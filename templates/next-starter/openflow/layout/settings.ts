import {
  type ImageValue,
  imageField,
  type LinkValue,
  linkField,
  type SettingsConfig,
} from "@openflow/core";
import type { Fields } from "@puckeditor/core";

/** Global content shared by every page, edited in the admin under "Réglages". */
export interface SiteSettingsValues {
  theme: "amber" | "emerald" | "indigo" | "rose" | "slate";
  logo: ImageValue | null;
  navigation: Array<{ label: string; link: LinkValue | null }>;
  headerCtaLabel: string;
  headerCtaLink: LinkValue | null;
  footerText: string;
  hoursLabel: string;
  mapLabel: string;
  socialLinks: Array<{ label: string; link: LinkValue | null }>;
  legalText: string;
}

const linkItem: Fields<{ label: string; link: LinkValue | null }> = {
  label: { type: "text", label: "Libellé" },
  link: linkField({ label: "Lien" }),
};

export const settingsFields: Fields<SiteSettingsValues> = {
  theme: {
    type: "select",
    label: "Couleur principale du site",
    options: [
      { label: "Ambre", value: "amber" },
      { label: "Émeraude", value: "emerald" },
      { label: "Indigo", value: "indigo" },
      { label: "Rose", value: "rose" },
      { label: "Ardoise", value: "slate" },
    ],
  },
  logo: imageField({ label: "Logo (sinon le nom du site est affiché)" }),
  navigation: {
    type: "array",
    label: "Menu principal",
    arrayFields: linkItem,
    defaultItemProps: { label: "Nouvelle entrée", link: null },
    getItemSummary: (item) => item.label || "Entrée de menu",
  },
  headerCtaLabel: { type: "text", label: "Bouton de l'en-tête (texte)" },
  headerCtaLink: linkField({ label: "Bouton de l'en-tête (lien)" }),
  footerText: { type: "textarea", label: "Présentation (pied de page)" },
  // Phone, e-mail, address and hours come from Réglages > Établissement (`site.business`).
  hoursLabel: { type: "text", label: "Titre des horaires (pied de page)" },
  mapLabel: { type: "text", label: "Lien vers le plan (texte)" },
  socialLinks: {
    type: "array",
    label: "Réseaux sociaux",
    arrayFields: linkItem,
    defaultItemProps: { label: "Instagram", link: null },
    getItemSummary: (item) => item.label || "Lien",
  },
  legalText: { type: "text", label: "Mention en bas de page" },
};

export const settingsDefaults: SiteSettingsValues = {
  theme: "amber",
  logo: null,
  navigation: [],
  headerCtaLabel: "Nous contacter",
  headerCtaLink: null,
  footerText: "Présentez votre activité en une phrase.",
  hoursLabel: "Horaires",
  mapLabel: "Voir le plan",
  socialLinks: [],
  legalText: "Tous droits réservés.",
};

export type SiteSettings = SettingsConfig<SiteSettingsValues>;
