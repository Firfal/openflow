import type { ComponentConfig } from "@puckeditor/core";
import { Section, type Tone, toneField } from "./shared";

export interface FaqProps {
  title: string;
  items: Array<{ question: string; answer: string }>;
  tone: Tone;
}

/** Questions / answers with native `<details>` (no JavaScript needed on the static site). */
export const Faq: ComponentConfig<FaqProps> = {
  label: "Questions fréquentes",
  fields: {
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
    tone: toneField,
  },
  defaultProps: {
    title: "Questions fréquentes",
    items: [
      {
        question: "Quels sont vos horaires ?",
        answer: "Nous sommes ouverts du mardi au samedi, de 9 h à 19 h.",
      },
      {
        question: "Proposez-vous des devis gratuits ?",
        answer: "Oui, contactez-nous et nous vous répondons sous 48 heures.",
      },
    ],
    tone: "muted",
  },
  render: ({ title, items, tone }) => (
    <Section tone={tone}>
      <div className="mx-auto max-w-3xl">
        {title && (
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        )}
        <div className="mt-12 divide-y divide-black/10 rounded-2xl bg-white text-stone-900 ring-1 ring-black/5">
          {items?.map((item, index) => (
            <details key={index} className="group p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {item.question}
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0 transition group-open:rotate-45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </summary>
              {item.answer && <p className="mt-4 leading-7 text-stone-600">{item.answer}</p>}
            </details>
          ))}
        </div>
      </div>
    </Section>
  ),
};
