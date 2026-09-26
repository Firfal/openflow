import type { ComponentConfig } from "@puckeditor/core";
import { anchorField, Heading, Section, SelectionFrame, type Surface, surfaceField } from "./ui";

export interface ComparisonProps {
  anchor: string;
  title: string;
  intro: string;
  criterionLabel: string;
  featuredLabel: string;
  otherLabel: string;
  thirdLabel: string;
  rows: Array<{ criterion: string; featured: string; other: string; third: string }>;
  surface: Surface;
}

/** Comparison table: the OpenFlow column carries the selection frame. */
export const Comparison: ComponentConfig<ComparisonProps> = {
  label: "Comparatif",
  fields: {
    anchor: anchorField,
    title: { type: "text", label: "Titre", contentEditable: true },
    intro: { type: "textarea", label: "Introduction", contentEditable: true },
    criterionLabel: { type: "text", label: "En-tête des critères", contentEditable: true },
    featuredLabel: { type: "text", label: "Colonne mise en avant", contentEditable: true },
    otherLabel: { type: "text", label: "Deuxième colonne", contentEditable: true },
    thirdLabel: { type: "text", label: "Troisième colonne", contentEditable: true },
    rows: {
      type: "array",
      label: "Lignes",
      arrayFields: {
        criterion: { type: "text", label: "Critère", contentEditable: true },
        featured: { type: "text", label: "Colonne mise en avant", contentEditable: true },
        other: { type: "text", label: "Deuxième colonne", contentEditable: true },
        third: { type: "text", label: "Troisième colonne", contentEditable: true },
      },
      defaultItemProps: { criterion: "Critère", featured: "Oui", other: "Non", third: "Non" },
      getItemSummary: (item) => item.criterion || "Ligne",
    },
    surface: surfaceField,
  },
  defaultProps: {
    anchor: "comparatif",
    title: "Pourquoi pas Webflow ou un CMS headless ?",
    intro:
      "Parce que le site est déjà écrit par Claude Code, et que ni vous ni votre client ne voulez d'un abonnement de plus.",
    criterionLabel: "Critère",
    featuredLabel: "OpenFlow",
    otherLabel: "Webflow, Framer",
    thirdLabel: "CMS headless",
    rows: [
      {
        criterion: "Code du site",
        featured: "Le vôtre, en Next.js",
        other: "Celui de la plateforme",
        third: "Le vôtre",
      },
      {
        criterion: "Édition directement sur la page",
        featured: "Oui",
        other: "Oui",
        third: "Rarement, souvent en option",
      },
      {
        criterion: "Hébergement et données",
        featured: "Votre projet Firebase",
        other: "Leur infrastructure",
        third: "Leur cloud",
      },
      {
        criterion: "Coût mensuel",
        featured: "Les quotas gratuits de Firebase",
        other: "Un abonnement par site",
        third: "Un abonnement par utilisateur",
      },
      { criterion: "Licence", featured: "MIT", other: "Propriétaire", third: "Variable" },
    ],
    surface: "calque",
  },
  render: ({
    anchor,
    title,
    intro,
    criterionLabel,
    featuredLabel,
    otherLabel,
    thirdLabel,
    rows,
    surface,
  }) => (
    <Section anchor={anchor} surface={surface}>
      <Heading title={title} intro={intro} surface={surface} />
      <div className="relative mt-16 overflow-x-auto pb-4 pt-10">
        <div className="relative min-w-[720px]">
          <SelectionFrame
            tag={featuredLabel}
            className="pointer-events-none absolute inset-y-0 left-[28%] w-[24%] rounded-sm"
          >
            <span />
          </SelectionFrame>
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[24%]" />
              <col className="w-[24%]" />
              <col className="w-[24%]" />
            </colgroup>
            <thead>
              <tr className="text-sm text-muted">
                <th scope="col" className="px-4 pb-4 font-medium">
                  {criterionLabel}
                </th>
                <th scope="col" className="px-5 pb-4 font-display text-lg font-bold text-fg">
                  {featuredLabel}
                </th>
                <th scope="col" className="px-5 pb-4 font-medium">
                  {otherLabel}
                </th>
                <th scope="col" className="px-5 pb-4 font-medium">
                  {thirdLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((row, index) => (
                <tr key={index} className="border-t border-rule align-top">
                  <th scope="row" className="px-4 py-4 font-semibold">
                    {row.criterion}
                  </th>
                  <td className="px-5 py-4 font-medium text-fg">{row.featured}</td>
                  <td className="px-5 py-4 text-muted">{row.other}</td>
                  <td className="px-5 py-4 text-muted">{row.third}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  ),
};
