import {
  consentButtonProps,
  getLegalDocument,
  type LegalBlock,
  type LegalDocumentKind,
  type LegalText,
  legalDocumentField,
  statsOptOutProps,
} from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";
import { buttonClass } from "./shared";

export interface LegalProps {
  legalDocument: LegalDocumentKind;
  extra: string;
}

function Runs({ text }: { text: LegalText[] }) {
  return text.map((run, index) =>
    typeof run === "string" ? (
      run
    ) : (
      <a
        key={index}
        href={run.href}
        className="text-accent underline decoration-1 underline-offset-2 break-words"
      >
        {run.text}
      </a>
    ),
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p>
          <Runs text={block.text} />
        </p>
      );
    case "list":
      return (
        <ul className={block.plain ? "space-y-1" : "list-disc space-y-1.5 pl-6"}>
          {block.items.map((item, index) => (
            <li key={index}>
              <Runs text={item} />
            </li>
          ))}
        </ul>
      );
    case "stats-optout": {
      const { status, button } = statsOptOutProps(block);
      return (
        <div className="flex flex-col gap-4 rounded-2xl bg-stone-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p {...status} className="font-medium text-stone-900">
            {block.counted}
          </p>
          <button {...button} className={`${buttonClass("light", "secondary")} shrink-0`}>
            {block.stop}
          </button>
        </div>
      );
    }
    case "consent":
      return (
        <button {...consentButtonProps()} className={buttonClass("light", "secondary")}>
          {block.label}
        </button>
      );
  }
}

/**
 * A legal page (privacy policy or legal notice): its text is written by OpenFlow from what the
 * site does and the owner's legal information (Réglages > Informations légales), and stays right
 * at each publication. The owner may add paragraphs of their own below it.
 */
export const Legal: ComponentConfig<LegalProps> = {
  label: "Page légale (écrite automatiquement)",
  fields: {
    legalDocument: legalDocumentField({ label: "Document" }),
    extra: { type: "richtext", label: "Informations complémentaires (facultatif)" },
  },
  defaultProps: {
    legalDocument: "privacy",
    extra: "",
  },
  render: ({ legalDocument, extra, puck }) => {
    const document = getLegalDocument(puck.metadata, legalDocument);
    return (
      <article className="bg-white px-6 pt-16 pb-20 text-stone-900 sm:pt-20">
        <div className="mx-auto max-w-3xl">
          {document && (
            <>
              <h1 className="text-4xl font-bold tracking-tight text-balance break-words sm:text-5xl">
                {document.title}
              </h1>
              <p className="mt-5 text-lg leading-8 text-pretty text-stone-600">{document.lead}</p>
              <div className="mt-12 space-y-12">
                {document.sections.map((section, index) => (
                  <section key={index} className="min-w-0">
                    <h2 className="text-2xl font-semibold tracking-tight text-balance">
                      {section.heading}
                    </h2>
                    <div className="mt-4 space-y-4 leading-7 break-words text-stone-700">
                      {section.blocks.map((block, n) => (
                        <Block key={n} block={block} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
          {extra && (
            <div className="mt-12 border-t border-stone-200 pt-12 leading-7 break-words text-stone-700 [&_.rich-text>*+*]:mt-4 [&_.rich-text>*+h2]:mt-10 [&_a]:text-accent [&_a]:underline [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-stone-900 [&_h3]:text-xl [&_h3]:font-semibold [&_li+li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6">
              {extra}
            </div>
          )}
        </div>
      </article>
    );
  },
};
