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

export interface TextImageProps {
  title: string;
  body: string;
  image: ImageValue | null;
  imagePosition: "left" | "right";
  linkLabel: string;
  link: LinkValue | null;
  tone: Tone;
}

export const TextImage: ComponentConfig<TextImageProps> = {
  label: "Texte et image",
  fields: {
    title: { type: "text", label: "Titre", contentEditable: true },
    body: { type: "richtext", label: "Texte" },
    image: imageField({ label: "Image" }),
    imagePosition: {
      type: "radio",
      label: "Position de l'image",
      options: [
        { label: "À gauche", value: "left" },
        { label: "À droite", value: "right" },
      ],
    },
    linkLabel: { type: "text", label: "Lien (texte)", contentEditable: true },
    link: linkField({ label: "Lien (destination)" }),
    tone: toneField,
  },
  defaultProps: {
    title: "Notre histoire",
    body: "<p>Racontez ici l'histoire de votre entreprise, vos valeurs et ce qui vous distingue. Un texte simple et sincère convainc mieux qu'un long discours.</p>",
    image: null,
    imagePosition: "right",
    linkLabel: "En savoir plus",
    link: null,
    tone: "light",
  },
  render: ({ title, body, image, imagePosition, linkLabel, link, tone }) => {
    const img = imageProps(image);
    return (
      <Section tone={tone}>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className={imagePosition === "left" ? "lg:order-2" : ""}>
            {title && <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>}
            <div className="mt-6 space-y-4 text-lg leading-8 opacity-80 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6">
              {body}
            </div>
            {linkLabel && (
              <a {...linkProps(link)} className={`mt-8 ${buttonClass(tone)}`}>
                {linkLabel}
              </a>
            )}
          </div>
          {img && (
            <div className={imagePosition === "left" ? "lg:order-1" : ""}>
              <img {...img} className="aspect-[4/3] w-full rounded-3xl object-cover shadow-lg" />
            </div>
          )}
        </div>
      </Section>
    );
  },
};
