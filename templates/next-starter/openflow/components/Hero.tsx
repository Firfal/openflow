import {
  type ImageValue,
  imageField,
  imageProps,
  type LinkValue,
  linkField,
  linkProps,
} from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";
import { buttonClass, Section, type Tone, toneField } from "./shared";

export interface HeroProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryLabel: string;
  primaryLink: LinkValue | null;
  secondaryLabel: string;
  secondaryLink: LinkValue | null;
  image: ImageValue | null;
  layout: "split" | "centered";
  tone: Tone;
}

/** Page header: the only section rendering an `h1` (one per page). */
export const Hero: ComponentConfig<HeroProps> = {
  label: "En-tête de page",
  fields: {
    eyebrow: { type: "text", label: "Surtitre", contentEditable: true },
    title: { type: "text", label: "Titre principal", contentEditable: true },
    subtitle: { type: "textarea", label: "Texte d'introduction", contentEditable: true },
    primaryLabel: { type: "text", label: "Bouton principal (texte)", contentEditable: true },
    primaryLink: linkField({ label: "Bouton principal (lien)" }),
    secondaryLabel: { type: "text", label: "Bouton secondaire (texte)", contentEditable: true },
    secondaryLink: linkField({ label: "Bouton secondaire (lien)" }),
    image: imageField({ label: "Image" }),
    layout: {
      type: "radio",
      label: "Disposition",
      options: [
        { label: "Texte et image côte à côte", value: "split" },
        { label: "Centrée", value: "centered" },
      ],
    },
    tone: toneField,
  },
  defaultProps: {
    eyebrow: "Artisan depuis 1998",
    title: "Un savoir-faire local, au service de vos projets",
    subtitle:
      "Présentez en deux phrases ce qui rend votre activité unique et ce que vos clients y gagnent.",
    primaryLabel: "Nous contacter",
    primaryLink: null,
    secondaryLabel: "Découvrir",
    secondaryLink: null,
    image: null,
    layout: "split",
    tone: "light",
  },
  render: ({
    eyebrow,
    title,
    subtitle,
    primaryLabel,
    primaryLink,
    secondaryLabel,
    secondaryLink,
    image,
    layout,
    tone,
  }) => {
    const img = imageProps(image);
    const centered = layout === "centered" || !img;
    return (
      <Section tone={tone} className="pt-24 sm:pt-32">
        <div
          className={
            centered ? "mx-auto max-w-3xl text-center" : "grid items-center gap-12 lg:grid-cols-2"
          }
        >
          <div>
            {eyebrow && (
              <p className="mb-4 text-sm font-semibold uppercase tracking-widest opacity-70">
                {eyebrow}
              </p>
            )}
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            {subtitle && <p className="mt-6 text-lg leading-8 opacity-80">{subtitle}</p>}
            <div className={`mt-10 flex flex-wrap gap-4 ${centered ? "justify-center" : ""}`}>
              {primaryLabel && (
                <a {...linkProps(primaryLink)} className={buttonClass(tone)}>
                  {primaryLabel}
                </a>
              )}
              {secondaryLabel && (
                <a {...linkProps(secondaryLink)} className={buttonClass(tone, "secondary")}>
                  {secondaryLabel}
                </a>
              )}
            </div>
          </div>
          {img && (
            <div className={centered ? "mt-16" : ""}>
              <img {...img} className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl" />
            </div>
          )}
        </div>
      </Section>
    );
  },
};
