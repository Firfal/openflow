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

export interface LegalProps {
  legalDocument: LegalDocumentKind;
  extra: string;
}

const BUTTON =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-ink/20 px-5 text-sm font-semibold transition-colors duration-150 hover:border-ink/40 hover:bg-white";

function Runs({ text }: { text: LegalText[] }) {
  return text.map((run, index) =>
    typeof run === "string" ? (
      run
    ) : (
      <a
        key={index}
        href={run.href}
        className="text-cobalt underline decoration-1 underline-offset-2 break-words"
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
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-white/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p {...status} className="font-medium text-ink">
            {block.counted}
          </p>
          <button {...button} className={BUTTON}>
            {block.stop}
          </button>
        </div>
      );
    }
    case "consent":
      return (
        <button {...consentButtonProps()} className={BUTTON}>
          {block.label}
        </button>
      );
  }
}

/**
 * A legal page (privacy policy or legal notice), written by OpenFlow from what the site does and
 * the publisher's details (Réglages > Informations légales).
 */
export const Legal: ComponentConfig<LegalProps> = {
  label: "Page légale (écrite automatiquement)",
  fields: {
    legalDocument: legalDocumentField({ label: "Document" }),
    extra: { type: "richtext", label: "Informations complémentaires (facultatif)" },
  },
  defaultProps: { legalDocument: "privacy", extra: "" },
  render: ({ legalDocument, extra, puck }) => {
    const document = getLegalDocument(puck.metadata, legalDocument);
    return (
      <article
        data-surface="calque"
        className="bg-paper px-5 pt-16 pb-24 text-ink sm:px-8 sm:pt-24 sm:pb-32"
      >
        <div className="mx-auto max-w-3xl">
          {document && (
            <>
              <h1 className="text-4xl font-bold leading-[1.05] break-words sm:text-6xl">
                {document.title}
              </h1>
              <p className="mt-6 text-lg leading-8 text-graphite">{document.lead}</p>
              <div className="mt-14 space-y-12">
                {document.sections.map((section, index) => (
                  <section key={index} className="min-w-0 border-t border-line pt-8">
                    <h2 className="text-2xl font-bold">{section.heading}</h2>
                    <div className="mt-4 space-y-4 leading-7 break-words text-ink-2">
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
            <div className="mt-12 border-t border-line pt-8 leading-7 break-words text-ink-2 [&_.rich-text>*+*]:mt-4 [&_a]:text-cobalt [&_a]:underline [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-6">
              {extra}
            </div>
          )}
        </div>
      </article>
    );
  },
};
