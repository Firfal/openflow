import type { ComponentConfig } from "@puckeditor/core";
import { anchorField, Heading, Section, type Surface, surfaceField } from "./ui";

export interface FaqProps {
  anchor: string;
  title: string;
  items: Array<{ question: string; answer: string }>;
  surface: Surface;
}

/** Native `<details>`: no JavaScript on the static site, the "+" rotates on open. */
export const Faq: ComponentConfig<FaqProps> = {
  label: "Questions fréquentes",
  fields: {
    anchor: anchorField,
    title: { type: "text", label: "Titre", contentEditable: true },
    items: {
      type: "array",
      label: "Questions",
      arrayFields: {
        question: { type: "text", label: "Question", contentEditable: true },
        answer: { type: "textarea", label: "Réponse", contentEditable: true },
      },
      defaultItemProps: {
        question: "Nouvelle question ?",
        answer: "La réponse, en quelques phrases.",
      },
      getItemSummary: (item) => item.question || "Question",
    },
    surface: surfaceField,
  },
  defaultProps: {
    anchor: "faq",
    title: "Questions fréquentes",
    items: [
      {
        question: "Mon client peut-il casser le site ?",
        answer:
          "Non. Il modifie le contenu des sections prévues pour lui. Le code et le design restent entre vos mains.",
      },
    ],
    surface: "calque",
  },
  render: ({ anchor, title, items, surface }) => (
    <Section anchor={anchor} surface={surface}>
      <div className="grid gap-12 lg:grid-cols-[5fr_7fr] [&>*]:min-w-0">
        <Heading title={title} surface={surface} />
        <div className="divide-y divide-line border-y border-line">
          {items?.map((item, index) => (
            <details key={index} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                {item.question}
                <svg
                  viewBox="0 0 24 24"
                  className="mt-1 h-5 w-5 shrink-0 text-cobalt transition-transform duration-200 ease-out group-open:rotate-45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </summary>
              {item.answer && (
                <p className="mt-3 max-w-2xl leading-7 text-graphite">{item.answer}</p>
              )}
            </details>
          ))}
        </div>
      </div>
    </Section>
  ),
};
