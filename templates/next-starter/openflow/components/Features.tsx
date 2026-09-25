import type { ComponentConfig } from "@puckeditor/core";
import { Icon, type IconName, iconField, Section, type Tone, toneField } from "./shared";

export interface FeaturesProps {
  title: string;
  intro: string;
  items: Array<{ icon: IconName; title: string; description: string }>;
  columns: "2" | "3" | "4";
  tone: Tone;
}

const COLUMNS = {
  "2": "sm:grid-cols-2",
  "3": "sm:grid-cols-2 lg:grid-cols-3",
  "4": "sm:grid-cols-2 lg:grid-cols-4",
};

export const Features: ComponentConfig<FeaturesProps> = {
  label: "Points forts",
  fields: {
    title: { type: "text", label: "Titre", contentEditable: true },
    intro: { type: "textarea", label: "Introduction", contentEditable: true },
    items: {
      type: "array",
      label: "Points forts",
      arrayFields: {
        icon: iconField,
        title: { type: "text", label: "Titre", contentEditable: true },
        description: { type: "textarea", label: "Description", contentEditable: true },
      },
      defaultItemProps: {
        icon: "star",
        title: "Nouveau point fort",
        description: "Décrivez ce bénéfice en une ou deux phrases.",
      },
      getItemSummary: (item) => item.title || "Point fort",
    },
    columns: {
      type: "select",
      label: "Colonnes",
      options: [
        { label: "2 colonnes", value: "2" },
        { label: "3 colonnes", value: "3" },
        { label: "4 colonnes", value: "4" },
      ],
    },
    tone: toneField,
  },
  defaultProps: {
    title: "Pourquoi nous choisir",
    intro: "Trois bonnes raisons de nous faire confiance.",
    items: [
      {
        icon: "leaf",
        title: "Produits locaux",
        description: "Nous travaillons avec des fournisseurs de la région.",
      },
      { icon: "clock", title: "Toujours à l'heure", description: "Des délais annoncés, et tenus." },
      {
        icon: "heart",
        title: "Service attentionné",
        description: "Une équipe disponible et à l'écoute.",
      },
    ],
    columns: "3",
    tone: "muted",
  },
  render: ({ title, intro, items, columns, tone }) => (
    <Section tone={tone}>
      <div className="mx-auto max-w-2xl text-center">
        {title && <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>}
        {intro && <p className="mt-4 text-lg opacity-80">{intro}</p>}
      </div>
      <div className={`mt-14 grid gap-8 ${COLUMNS[columns] ?? COLUMNS["3"]}`}>
        {items?.map((item, index) => (
          <div key={index} className="rounded-2xl bg-white/60 p-8 shadow-sm ring-1 ring-black/5">
            <div className="mb-5 inline-flex rounded-xl bg-accent/10 p-3 text-accent">
              <Icon name={item.icon} />
            </div>
            {item.title && <h3 className="text-lg font-semibold">{item.title}</h3>}
            {item.description && <p className="mt-2 leading-7 opacity-80">{item.description}</p>}
          </div>
        ))}
      </div>
    </Section>
  ),
};
