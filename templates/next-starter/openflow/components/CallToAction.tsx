import { type LinkValue, linkField, linkProps } from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";
import { buttonClass, Section, type Tone, toneField } from "./shared";

export interface CallToActionProps {
  title: string;
  text: string;
  buttonLabel: string;
  buttonLink: LinkValue | null;
  tone: Tone;
}

export const CallToAction: ComponentConfig<CallToActionProps> = {
  label: "Appel à l'action",
  fields: {
    title: { type: "text", label: "Titre", contentEditable: true },
    text: { type: "textarea", label: "Texte", contentEditable: true },
    buttonLabel: { type: "text", label: "Bouton (texte)", contentEditable: true },
    buttonLink: linkField({ label: "Bouton (lien)" }),
    tone: toneField,
  },
  defaultProps: {
    title: "Parlons de votre projet",
    text: "Écrivez-nous : nous vous répondons rapidement, sans engagement.",
    buttonLabel: "Nous écrire",
    buttonLink: null,
    tone: "accent",
  },
  render: ({ title, text, buttonLabel, buttonLink, tone }) => (
    <Section tone={tone}>
      <div className="mx-auto max-w-3xl text-center">
        {title && <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>}
        {text && <p className="mt-4 text-lg opacity-90">{text}</p>}
        {buttonLabel && (
          <a {...linkProps(buttonLink)} className={`mt-10 ${buttonClass(tone)}`}>
            {buttonLabel}
          </a>
        )}
      </div>
    </Section>
  ),
};
