import type { ComponentConfig } from "@puckeditor/core";
import { CopyButton } from "./CopyButton";
import { anchorField, Heading, Section, type Surface, surfaceField } from "./ui";

export interface GetStartedProps {
  anchor: string;
  title: string;
  intro: string;
  blockTitle: string;
  lines: Array<{ code: string; comment: string }>;
  copyLabel: string;
  copiedLabel: string;
  note: string;
  surface: Surface;
}

export const GetStarted: ComponentConfig<GetStartedProps> = {
  label: "Démarrer (code)",
  fields: {
    anchor: anchorField,
    title: { type: "text", label: "Titre", contentEditable: true },
    intro: { type: "textarea", label: "Introduction", contentEditable: true },
    blockTitle: { type: "text", label: "Titre du bloc de code", contentEditable: true },
    lines: {
      type: "array",
      label: "Lignes",
      arrayFields: {
        code: { type: "text", label: "Commande", metadata: { openflowInline: false } },
        comment: { type: "text", label: "Commentaire", contentEditable: true },
      },
      defaultItemProps: { code: "commande", comment: "Ce que fait la commande" },
      getItemSummary: (item) => item.code || "Ligne",
    },
    copyLabel: { type: "text", label: "Bouton copier", contentEditable: true },
    copiedLabel: { type: "text", label: "Bouton copier (après copie)", contentEditable: true },
    note: { type: "textarea", label: "Note sous le bloc", contentEditable: true },
    surface: surfaceField,
  },
  defaultProps: {
    anchor: "demarrer",
    title: "Démarrer depuis Claude Code",
    intro:
      "Installez le plugin, puis décrivez le site à créer. Claude s'occupe du reste, norme comprise.",
    blockTitle: "Claude Code",
    lines: [
      {
        code: "/plugin marketplace add Firfal/openflow",
        comment: "Ajoute la marketplace OpenFlow",
      },
      { code: "/plugin install openflow@openflow", comment: "Installe les skills et les hooks" },
      {
        code: "Crée le site de la boulangerie Dupont avec OpenFlow",
        comment: "Décrivez le site, Claude le construit",
      },
    ],
    copyLabel: "Copier",
    copiedLabel: "Copié",
    note: "Sans Claude Code : npx openflow create mon-site, puis npx openflow dev.",
    surface: "calque",
  },
  render: ({ anchor, title, intro, blockTitle, lines, copyLabel, copiedLabel, note, surface }) => {
    const all = (lines ?? []).map((line) => line.code).join("\n");
    return (
      <Section anchor={anchor} surface={surface}>
        <div className="grid items-start gap-14 lg:grid-cols-[5fr_7fr] [&>*]:min-w-0">
          <Heading title={title} intro={intro} surface={surface} />
          <div>
            <div className="overflow-hidden rounded-2xl bg-ink text-white shadow-[0_40px_90px_-40px_rgb(15_30_51/0.6)] ring-1 ring-ink/10">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-2.5 text-xs text-white/55">
                <span>{blockTitle}</span>
                <CopyButton text={all} label={copyLabel} copiedLabel={copiedLabel} />
              </div>
              <ol
                className="space-y-5 overflow-x-auto px-5 py-6 font-mono text-[14px]"
                translate="no"
              >
                {lines?.map((line, index) => (
                  <li key={index}>
                    {line.comment && <p className="text-white/45">{line.comment}</p>}
                    <p className="mt-1 whitespace-nowrap">
                      <span className="mr-2 select-none text-flame" aria-hidden="true">
                        &gt;
                      </span>
                      {line.code}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
            {note && <p className="mt-5 text-[15px] text-graphite">{note}</p>}
          </div>
        </div>
      </Section>
    );
  },
};
