import { type ImageValue, imageField, imageProps } from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";
import { Section, type Tone, toneField } from "./shared";

export interface TestimonialsProps {
  title: string;
  items: Array<{ quote: string; author: string; role: string; photo: ImageValue | null }>;
  tone: Tone;
}

export const Testimonials: ComponentConfig<TestimonialsProps> = {
  label: "Témoignages",
  fields: {
    title: { type: "text", label: "Titre", contentEditable: true },
    items: {
      type: "array",
      label: "Témoignages",
      arrayFields: {
        quote: { type: "textarea", label: "Citation", contentEditable: true },
        author: { type: "text", label: "Nom", contentEditable: true },
        role: { type: "text", label: "Fonction ou ville", contentEditable: true },
        photo: imageField({ label: "Photo" }),
      },
      defaultItemProps: {
        quote: "Un témoignage client sincère et précis.",
        author: "Prénom Nom",
        role: "Client",
        photo: null,
      },
      getItemSummary: (item) => item.author || "Témoignage",
    },
    tone: toneField,
  },
  defaultProps: {
    title: "Ils nous font confiance",
    items: [
      {
        quote: "Un accueil chaleureux et un travail impeccable. Je recommande sans hésiter.",
        author: "Camille D.",
        role: "Cliente depuis 2019",
        photo: null,
      },
      {
        quote: "Réactifs, précis et de très bon conseil.",
        author: "Thomas L.",
        role: "Chef d'entreprise",
        photo: null,
      },
    ],
    tone: "light",
  },
  render: ({ title, items, tone }) => (
    <Section tone={tone}>
      {title && (
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      )}
      <div className="mt-14 grid gap-8 md:grid-cols-2">
        {items?.map((item, index) => {
          const photo = imageProps(item.photo);
          return (
            <figure
              key={index}
              className="rounded-3xl bg-stone-50 p-8 text-stone-900 ring-1 ring-black/5"
            >
              {item.quote && <blockquote className="text-lg leading-8">{item.quote}</blockquote>}
              <figcaption className="mt-6 flex items-center gap-4">
                {photo && <img {...photo} className="h-12 w-12 rounded-full object-cover" />}
                <div>
                  {item.author && <div className="font-semibold">{item.author}</div>}
                  {item.role && <div className="text-sm opacity-70">{item.role}</div>}
                </div>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </Section>
  ),
};
