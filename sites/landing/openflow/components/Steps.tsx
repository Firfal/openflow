import type { ComponentConfig } from "@puckeditor/core";
import { anchorField, Heading, Section, type Surface, surfaceField } from "./ui";

export interface StepsProps {
  anchor: string;
  title: string;
  intro: string;
  steps: Array<{ title: string; text: string; detail: string }>;
  surface: Surface;
}

/** A real sequence (create → edit → publish): numbering is information here, not decoration. */
export const Steps: ComponentConfig<StepsProps> = {
  label: "Étapes",
  fields: {
    anchor: anchorField,
    title: { type: "text", label: "Titre", contentEditable: true },
    intro: { type: "textarea", label: "Introduction", contentEditable: true },
    steps: {
      type: "array",
      label: "Étapes",
      arrayFields: {
        title: { type: "text", label: "Titre", contentEditable: true },
        text: { type: "textarea", label: "Explication", contentEditable: true },
        detail: { type: "text", label: "Détail technique (code)", contentEditable: true },
      },
      defaultItemProps: { title: "Nouvelle étape", text: "Ce qui se passe.", detail: "commande" },
      getItemSummary: (item) => item.title || "Étape",
      max: 4,
    },
    surface: surfaceField,
  },
  defaultProps: {
    anchor: "fonctionnement",
    title: "Trois rôles, un seul site",
    intro: "Le code appartient à l'agence, le contenu au propriétaire. OpenFlow fait la jonction.",
    steps: [
      {
        title: "Claude Code crée le site",
        text: "Le plugin part d'un modèle Next.js et déclare chaque texte, image et lien comme un champ éditable.",
        detail: "/plugin install openflow@openflow",
      },
      {
        title: "Le propriétaire modifie",
        text: "Depuis /admin, il clique sur un titre pour le réécrire, change une photo, ajoute une section.",
        detail: "monsite.fr/admin",
      },
      {
        title: "OpenFlow publie",
        text: "Un clic sur Publier fige le contenu, reconstruit le site en HTML statique et le met en ligne.",
        detail: "Firebase Hosting",
      },
    ],
    surface: "calque",
  },
  render: ({ anchor, title, intro, steps, surface }) => (
    <Section anchor={anchor} surface={surface}>
      <Heading title={title} intro={intro} surface={surface} />
      <ol className="relative mt-20 grid gap-14 md:grid-cols-3 md:gap-8">
        <span
          className="absolute left-5 top-5 hidden h-px w-[calc(100%-2.5rem)] border-t-2 border-dashed border-cobalt/40 md:block"
          aria-hidden="true"
        />
        {steps?.map((step, index) => (
          <li key={index} className="relative">
            <span
              className="relative z-10 flex h-10 w-10 items-center justify-center border-[1.5px] border-cobalt bg-paper font-display text-lg font-bold text-cobalt"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            {step.title && <h3 className="mt-7 text-2xl font-bold">{step.title}</h3>}
            {step.text && <p className="mt-3 max-w-sm leading-7 text-graphite">{step.text}</p>}
            {step.detail && (
              <code
                translate="no"
                className="mt-5 inline-block rounded-md bg-ink px-3 py-1.5 font-mono text-[13px] text-white/85"
              >
                {step.detail}
              </code>
            )}
          </li>
        ))}
      </ol>
    </Section>
  ),
};
