import { type LinkValue, linkField, linkProps } from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";
import { DemoToggle } from "./DemoToggle";

export interface HeroEditorProps {
  title: string;
  subtitle: string;
  primaryLabel: string;
  primaryLink: LinkValue | null;
  secondaryLabel: string;
  secondaryLink: LinkValue | null;
  installCommand: string;
  demoUrl: string;
  demoTabs: Array<{ label: string }>;
  demoFieldLabel: string;
  demoBefore: string;
  demoAfter: string;
  demoPending: string;
  demoSaved: string;
  demoPublish: string;
  demoLive: string;
  demoPauseLabel: string;
  demoPlayLabel: string;
}

function Skeleton({ className }: { className: string }) {
  return <span className={`block rounded-full bg-ink/10 ${className}`} />;
}

function Cursor() {
  return (
    <svg viewBox="0 0 24 24" className="demo-cursor" data-anim aria-hidden="true">
      <path
        d="M4 2.5 20 13l-7.2 1.4L9.6 21z"
        fill="white"
        stroke="#0f1e33"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Page header with the one orchestrated animation of the site: the admin window clicks the
 * title, retypes it, saves and publishes. Static (final state) in the editor and for users who
 * prefer reduced motion.
 */
export const HeroEditor: ComponentConfig<HeroEditorProps> = {
  label: "En-tête avec démo de l'éditeur",
  fields: {
    title: { type: "text", label: "Titre principal", contentEditable: true },
    subtitle: { type: "textarea", label: "Texte d'introduction", contentEditable: true },
    primaryLabel: { type: "text", label: "Bouton principal (texte)", contentEditable: true },
    primaryLink: linkField({ label: "Bouton principal (lien)" }),
    secondaryLabel: { type: "text", label: "Bouton secondaire (texte)", contentEditable: true },
    secondaryLink: linkField({ label: "Bouton secondaire (lien)" }),
    installCommand: { type: "text", label: "Commande d'installation", contentEditable: true },
    demoUrl: { type: "text", label: "Démo : adresse affichée", contentEditable: true },
    demoTabs: {
      type: "array",
      label: "Démo : onglets de l'admin",
      arrayFields: { label: { type: "text", label: "Onglet", contentEditable: true } },
      defaultItemProps: { label: "Onglet" },
      getItemSummary: (item) => item.label || "Onglet",
      max: 4,
    },
    demoFieldLabel: { type: "text", label: "Démo : nom du champ", contentEditable: true },
    demoBefore: { type: "text", label: "Démo : texte avant", contentEditable: true },
    demoAfter: { type: "text", label: "Démo : texte après", contentEditable: true },
    demoPending: { type: "text", label: "Démo : enregistrement en cours", contentEditable: true },
    demoSaved: { type: "text", label: "Démo : enregistré", contentEditable: true },
    demoPublish: { type: "text", label: "Démo : bouton publier", contentEditable: true },
    demoLive: { type: "text", label: "Démo : en ligne", contentEditable: true },
    demoPauseLabel: { type: "text", label: "Démo : bouton pause", contentEditable: true },
    demoPlayLabel: { type: "text", label: "Démo : bouton lecture", contentEditable: true },
  },
  defaultProps: {
    title: "Claude Code construit le site. Votre client le modifie lui-même.",
    subtitle:
      "OpenFlow ajoute un éditeur visuel aux sites Next.js créés par l'IA : on clique sur un texte pour le changer, on publie, et le site reste statique sur Firebase.",
    primaryLabel: "Voir le code sur GitHub",
    primaryLink: null,
    secondaryLabel: "Comment ça marche",
    secondaryLink: null,
    installCommand: "npx openflow create mon-site",
    demoUrl: "boulangerie-dupont.fr/admin",
    demoTabs: [{ label: "Pages" }, { label: "Réglages" }, { label: "Historique" }],
    demoFieldLabel: "Titre principal",
    demoBefore: "Pain au levain, cuit ce matin",
    demoAfter: "Brioche du dimanche, dès 8 h",
    demoPending: "Enregistrement…",
    demoSaved: "Enregistré",
    demoPublish: "Publier",
    demoLive: "En ligne",
    demoPauseLabel: "Mettre la démo en pause",
    demoPlayLabel: "Relancer la démo",
  },
  render: ({
    title,
    subtitle,
    primaryLabel,
    primaryLink,
    secondaryLabel,
    secondaryLink,
    installCommand,
    demoUrl,
    demoTabs,
    demoFieldLabel,
    demoBefore,
    demoAfter,
    demoPending,
    demoSaved,
    demoPublish,
    demoLive,
    demoPauseLabel,
    demoPlayLabel,
    puck,
  }) => (
    <section className="bg-plan overflow-hidden px-5 pb-24 pt-16 text-white sm:px-8 sm:pb-32 sm:pt-24">
      <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1fr_1.12fr] lg:gap-14 [&>*]:min-w-0">
        <div>
          <h1 className="text-[clamp(2.5rem,4.6vw,4.4rem)] font-bold leading-[0.98] tracking-[-0.018em] [font-stretch:90%] [font-variation-settings:'opsz'_96]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/70 sm:text-xl">{subtitle}</p>
          )}
          <div className="mt-10 flex flex-wrap gap-3">
            {primaryLabel && (
              <a
                {...linkProps(primaryLink)}
                className="btn bg-cobalt text-white hover:bg-[#1f47e6]"
              >
                {primaryLabel}
              </a>
            )}
            {secondaryLabel && (
              <a
                {...linkProps(secondaryLink)}
                className="btn text-white ring-1 ring-white/25 ring-inset hover:bg-white/10"
              >
                {secondaryLabel}
              </a>
            )}
          </div>
          {installCommand && (
            <p className="mt-10 inline-flex max-w-full items-center gap-3 overflow-x-auto rounded-lg bg-white/5 px-4 py-2.5 font-mono text-sm text-white/85 ring-1 ring-white/10">
              <span className="select-none text-flame" aria-hidden="true">
                $
              </span>
              <code translate="no">{installCommand}</code>
            </p>
          )}
        </div>

        <DemoToggle pauseLabel={demoPauseLabel} playLabel={demoPlayLabel} hidden={puck?.isEditing}>
          <div
            className={`demo before:absolute before:-inset-16 before:-z-10 before:rounded-full before:bg-[radial-gradient(closest-side,rgb(47_91_255/0.28),transparent)] before:blur-2xl ${puck?.isEditing ? "is-static" : ""}`}
            aria-hidden="true"
          >
            <div className="overflow-hidden rounded-2xl bg-ink-2 shadow-[0_50px_120px_-30px_rgb(0_0_0/0.75)] ring-1 ring-white/10">
              <div className="flex h-12 items-center gap-3 border-b border-white/10 px-4 text-xs">
                <span className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                </span>
                <span className="hidden truncate rounded-md bg-white/5 px-3 py-1 font-mono text-white/55 sm:block">
                  {demoUrl}
                </span>
                <span className="ml-2 hidden gap-4 text-white/55 2xl:flex">
                  {demoTabs?.map((tab, index) => (
                    <span key={index} className={index === 0 ? "text-white" : ""}>
                      {tab.label}
                    </span>
                  ))}
                </span>
                <span className="relative ml-auto grid text-white/55 [&>*]:[grid-area:1/1]">
                  <span className="demo-pending" data-anim>
                    {demoPending}
                  </span>
                  <span className="demo-saved" data-anim>
                    {demoSaved}
                  </span>
                </span>
                <span
                  className="demo-live flex items-center gap-1.5 font-semibold text-flame"
                  data-anim
                >
                  <span className="demo-live-dot h-2 w-2 rounded-full bg-flame" />
                  {demoLive}
                </span>
                <span
                  className="demo-publish rounded-md bg-cobalt px-3 py-1.5 font-semibold text-white"
                  data-anim
                >
                  {demoPublish}
                </span>
              </div>
              <div className="h-0.5 bg-transparent">
                <div className="demo-progress h-full bg-flame" data-anim />
              </div>

              <div className="grid xl:grid-cols-[minmax(0,1fr)_210px]">
                <div className="bg-paper p-6 text-ink sm:p-9">
                  <div className="mb-10 flex items-center gap-3">
                    <span className="h-5 w-5 rounded-md bg-ink" />
                    <Skeleton className="h-2 w-16" />
                    <Skeleton className="ml-auto h-2 w-10" />
                    <Skeleton className="h-2 w-10" />
                  </div>
                  <div className="relative mb-5 inline-grid max-w-full [&>*]:[grid-area:1/1]">
                    <span className="demo-select pointer-events-none" data-anim>
                      <span className="selection-frame absolute inset-0">
                        <span className="handle -left-[11px] -top-[11px]" />
                        <span className="handle -right-[11px] -top-[11px]" />
                        <span className="handle -bottom-[11px] -left-[11px]" />
                        <span className="handle -bottom-[11px] -right-[11px]" />
                        <span className="absolute -top-9 left-[-7px] whitespace-nowrap rounded-md bg-cobalt px-2 py-0.5 text-[11px] font-semibold text-white">
                          {demoFieldLabel}
                        </span>
                      </span>
                    </span>
                    <span
                      className="demo-before whitespace-nowrap font-display text-[clamp(1.1rem,1.6vw,1.5rem)] font-bold leading-tight"
                      data-anim
                    >
                      {demoBefore}
                    </span>
                    <span
                      className="demo-after font-display text-[clamp(1.1rem,1.6vw,1.5rem)] font-bold leading-tight"
                      data-anim
                    >
                      <span className="demo-after-text">{demoAfter}</span>
                      <span className="demo-caret" />
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    <Skeleton className="h-2 w-11/12" />
                    <Skeleton className="h-2 w-4/5" />
                    <Skeleton className="h-2 w-2/3" />
                  </div>
                  <div className="mt-8 grid grid-cols-3 gap-3">
                    <span className="col-span-2 h-24 rounded-xl bg-[linear-gradient(135deg,#2f5bff_0%,#7b93ff_55%,#ffb27a_100%)]" />
                    <span className="h-24 rounded-xl bg-ink/10" />
                  </div>
                </div>
                <div className="hidden space-y-5 border-l border-white/10 p-4 text-xs xl:block">
                  <div>
                    <span className="mb-2 block font-semibold text-white/70">{demoFieldLabel}</span>
                    <span className="relative grid h-9 items-center overflow-hidden rounded-md bg-white/5 px-2.5 text-white ring-1 ring-cobalt [&>*]:[grid-area:1/1]">
                      <span className="demo-field-before truncate" data-anim>
                        {demoBefore}
                      </span>
                      <span className="demo-field-after truncate" data-anim>
                        {demoAfter}
                      </span>
                    </span>
                  </div>
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="space-y-2">
                      <span className="block h-1.5 w-16 rounded-full bg-white/15" />
                      <span className="block h-9 rounded-md bg-white/5 ring-1 ring-white/10" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <Cursor />
          </div>
        </DemoToggle>
      </div>
    </section>
  ),
};
