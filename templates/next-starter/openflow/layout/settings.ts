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
  contactEmail: string;
  contactPhone: string;
  address: string;
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
  contactEmail: { type: "text", label: "E-mail de contact" },
  contactPhone: { type: "text", label: "Téléphone" },
  address: { type: "textarea", label: "Adresse" },
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
  contactEmail: "contact@exemple.fr",
  contactPhone: "",
  address: "",
  socialLinks: [],
  legalText: "Tous droits réservés.",
};

export type SiteSettings = SettingsConfig<SiteSettingsValues>;
