import { type LinkValue, linkField, linkProps } from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";
import { anchorField, Heading, Section, type Surface, surfaceField } from "./ui";

type LineKind = "command" | "error" | "fix" | "ok" | "info";

export interface StandardTerminalProps {
  anchor: string;
  title: string;
  intro: string;
  body: string;
  terminalTitle: string;
  lines: Array<{ kind: LineKind; text: string }>;
  stats: Array<{ value: string; label: string }>;
  linkLabel: string;
  link: LinkValue | null;
  surface: Surface;
}

const LINE_STYLES: Record<LineKind, { prefix: string; className: string }> = {
  command: { prefix: "$", className: "text-white" },
  error: { prefix: "", className: "text-[#ff8f8f]" },
  fix: { prefix: "", className: "pl-4 text-white/60" },
  ok: { prefix: "", className: "text-[#7ee2b8]" },
  info: { prefix: "", className: "text-white/45" },
};

export const StandardTerminal: ComponentConfig<StandardTerminalProps> = {
  label: "Norme et terminal",
  fields: {
    anchor: anchorField,
    title: { type: "text", label: "Titre", contentEditable: true },
    intro: { type: "textarea", label: "Introduction", contentEditable: true },
    body: { type: "richtext", label: "Texte" },
    terminalTitle: { type: "text", label: "Titre du terminal", contentEditable: true },
    lines: {
      type: "array",
      label: "Lignes du terminal",
      arrayFields: {
        kind: {
          type: "select",
          label: "Type",
          options: [
            { label: "Commande", value: "command" },
            { label: "Erreur", value: "error" },
            { label: "Correctif", value: "fix" },
            { label: "Succès", value: "ok" },
            { label: "Information", value: "info" },
          ],
        },
        text: { type: "text", label: "Texte", contentEditable: true },
      },
      defaultItemProps: { kind: "info", text: "Nouvelle ligne" },
      getItemSummary: (item) => item.text || "Ligne",
    },
    stats: {
      type: "array",
      label: "Chiffres",
      arrayFields: {
        value: { type: "text", label: "Valeur", contentEditable: true },
        label: { type: "text", label: "Légende", contentEditable: true },
      },
      defaultItemProps: { value: "0", label: "Légende" },
      getItemSummary: (item) => `${item.value} ${item.label}`,
      max: 3,
    },
    linkLabel: { type: "text", label: "Lien (texte)", contentEditable: true },
    link: linkField({ label: "Lien (destination)" }),
    surface: surfaceField,
  },
  defaultProps: {
    anchor: "norme",
    title: "Une norme qui corrige l'IA pendant qu'elle code",
    intro:
      "Un site généré n'est utile au client que si tout y est éditable. La norme OpenFlow le vérifie à chaque fichier écrit.",
    body: "<p>Texte en dur, image importée, lien figé, champ jamais affiché, API incompatible avec l'export statique : chaque écart revient à Claude Code avec la ligne en cause et le correctif.</p><p>Tant que le site n'est pas conforme, Claude ne rend pas la main.</p>",
    terminalTitle: "Hook Claude Code",
    lines: [
      { kind: "command", text: "Write openflow/components/Hero.tsx" },
      { kind: "error", text: "✖ OF-101 Hero.tsx:14 Texte en dur « Bienvenue »" },
      { kind: "fix", text: "Créez un champ title (text, contentEditable), puis affichez {title}." },
      { kind: "command", text: "Edit openflow/components/Hero.tsx" },
      { kind: "ok", text: "✓ Conforme à la norme OFS, 29 champs sur 29 éditables" },
    ],
    stats: [
      { value: "20", label: "règles vérifiées" },
      { value: "3", label: "niveaux de contrôle" },
      { value: "< 1 s", label: "par fichier modifié" },
    ],
    linkLabel: "Lire la norme OFS",
    link: null,
    surface: "calque",
  },
  render: ({
    anchor,
    title,
    intro,
    body,
    terminalTitle,
    lines,
    stats,
    linkLabel,
    link,
    surface,
  }) => (
    <Section anchor={anchor} surface={surface}>
      <div className="grid items-start gap-16 lg:grid-cols-2 [&>*]:min-w-0">
        <div>
          <Heading title={title} intro={intro} surface={surface} />
          <div className="mt-6 max-w-xl space-y-4 leading-7 text-muted [&_code]:font-mono [&_code]:text-[15px]">
            {body}
          </div>
          {stats && stats.length > 0 && (
            <dl className="mt-12 grid grid-cols-3 gap-6 border-t border-rule pt-8">
              {stats.map((stat, index) => (
                <div key={index} className="flex flex-col-reverse">
                  <dt className="mt-1 text-sm text-muted">{stat.label}</dt>
                  <dd className="font-display text-4xl font-bold tracking-tight tabular-nums">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {linkLabel && (
            <a
              {...linkProps(link)}
              className="mt-10 inline-block font-semibold text-cobalt underline decoration-2 underline-offset-4 hover:decoration-cobalt/40"
            >
              {linkLabel}
            </a>
          )}
        </div>
        <figure className="overflow-hidden rounded-2xl bg-ink font-mono text-[13.5px] leading-7 text-white shadow-[0_40px_90px_-40px_rgb(15_30_51/0.6)] ring-1 ring-ink/10 lg:mt-4">
          <figcaption className="flex items-center gap-3 border-b border-white/10 px-5 py-3 text-xs text-white/55">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            </span>
            {terminalTitle}
          </figcaption>
          <div className="overflow-x-auto px-5 py-5" translate="no">
            {lines?.map((line, index) => {
              const style = LINE_STYLES[line.kind] ?? LINE_STYLES.info;
              return (
                <p
                  key={index}
                  className={`whitespace-pre-wrap ${style.className} ${line.kind === "command" && index > 0 ? "mt-4" : ""}`}
                >
                  {style.prefix && (
                    <span className="mr-2 select-none text-flame" aria-hidden="true">
                      {style.prefix}
                    </span>
                  )}
                  {line.text}
                </p>
              );
            })}
            <span
              className="mt-1 inline-block h-5 w-2.5 translate-y-1 bg-cobalt"
              aria-hidden="true"
            />
          </div>
        </figure>
      </div>
    </Section>
  ),
};
