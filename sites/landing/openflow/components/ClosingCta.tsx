import { type LinkValue, linkField, linkProps } from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";
import { SelectionFrame } from "./ui";

export interface ClosingCtaProps {
  tag: string;
  title: string;
  text: string;
  buttonLabel: string;
  buttonLink: LinkValue | null;
}

/** "This page proves itself": the closing statement wears the selection frame. */
export const ClosingCta: ComponentConfig<ClosingCtaProps> = {
  label: "Appel final",
  fields: {
    tag: { type: "text", label: "Étiquette de sélection", contentEditable: true },
    title: { type: "text", label: "Titre", contentEditable: true },
    text: { type: "textarea", label: "Texte", contentEditable: true },
    buttonLabel: { type: "text", label: "Bouton (texte)", contentEditable: true },
    buttonLink: linkField({ label: "Bouton (lien)" }),
  },
  defaultProps: {
    tag: "Titre de section",
    title: "Cette page est éditée avec OpenFlow.",
    text: "Son contenu vit dans Firestore et se modifie depuis /admin, comme celui de n'importe quel site OpenFlow.",
    buttonLabel: "Contribuer sur GitHub",
    buttonLink: null,
  },
  render: ({ tag, title, text, buttonLabel, buttonLink }) => (
    <section className="bg-calque px-5 pb-32 pt-16 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <SelectionFrame tag={tag} className="mt-10 max-w-4xl rounded-sm">
          <h2 className="text-[clamp(2.2rem,5vw,4.2rem)] font-bold leading-[1] tracking-[-0.018em] [font-stretch:90%] [font-variation-settings:'opsz'_96]">
            {title}
          </h2>
        </SelectionFrame>
        {text && <p className="mt-10 max-w-xl text-lg leading-8 text-muted">{text}</p>}
        {buttonLabel && (
          <a {...linkProps(buttonLink)} className="btn mt-9 bg-ink text-white hover:bg-ink-3">
            {buttonLabel}
          </a>
        )}
      </div>
    </section>
  ),
};
