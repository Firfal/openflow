import { type LinkValue, linkField, type SettingsConfig } from "@openflow/core";
import type { Fields } from "@puckeditor/core";

/** Global content shared by every page, edited in the admin under "Réglages". */
export interface SiteSettingsValues {
  navigation: Array<{ label: string; link: LinkValue | null }>;
  headerCtaLabel: string;
  headerCtaLink: LinkValue | null;
  skipLinkLabel: string;
  footerText: string;
  footerLinks: Array<{ label: string; link: LinkValue | null }>;
  legalText: string;
}

const linkItem: Fields<{ label: string; link: LinkValue | null }> = {
  label: { type: "text", label: "Libellé" },
  link: linkField({ label: "Lien" }),
};

export const settingsFields: Fields<SiteSettingsValues> = {
  navigation: {
    type: "array",
    label: "Menu principal",
    arrayFields: linkItem,
    defaultItemProps: { label: "Nouvelle entrée", link: null },
    getItemSummary: (item) => item.label || "Entrée de menu",
  },
  headerCtaLabel: { type: "text", label: "Bouton de l'en-tête (texte)" },
  headerCtaLink: linkField({ label: "Bouton de l'en-tête (lien)" }),
  skipLinkLabel: { type: "text", label: "Lien d'évitement (accessibilité)" },
  footerText: { type: "textarea", label: "Présentation (pied de page)" },
  footerLinks: {
    type: "array",
    label: "Liens du pied de page",
    arrayFields: linkItem,
    defaultItemProps: { label: "Lien", link: null },
    getItemSummary: (item) => item.label || "Lien",
  },
  legalText: { type: "text", label: "Mention en bas de page" },
};

export const settingsDefaults: SiteSettingsValues = {
  navigation: [],
  headerCtaLabel: "GitHub",
  headerCtaLink: null,
  skipLinkLabel: "Aller au contenu",
  footerText: "Un CMS visuel open source pour les sites créés avec Claude Code.",
  footerLinks: [],
  legalText: "Licence MIT",
};

export type SiteSettings = SettingsConfig<SiteSettingsValues>;
