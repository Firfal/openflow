import type { Field } from "@puckeditor/core";
import type { ReactNode } from "react";

/** In-page anchor (`#norme`) so the navigation can link to a section. */
export const anchorField: Field<string> = {
  type: "text",
  label: "Ancre du menu (sans #, ex. norme)",
};

export type Surface = "calque" | "encre";

export const surfaceField: Field<Surface> = {
  type: "radio",
  label: "Fond",
  options: [
    { label: "Calque (clair)", value: "calque" },
    { label: "Encre (sombre)", value: "encre" },
  ],
};

const SURFACES: Record<Surface, string> = {
  calque: "bg-calque text-ink",
  encre: "bg-plan text-white",
};

export function Section({
  anchor,
  surface = "calque",
  className = "",
  children,
}: {
  anchor?: string;
  surface?: Surface;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={anchor || undefined}
      data-surface={SURFACES[surface] ? surface : "calque"}
      className={`${SURFACES[surface] ?? SURFACES.calque} px-5 py-24 sm:px-8 sm:py-32 ${className}`}
    >
      <div className="mx-auto max-w-7xl">{children}</div>
    </section>
  );
}

/** Section heading block: left-aligned, no eyebrow (see DESIGN.md). */
export function Heading({
  title,
  intro,
}: {
  title: ReactNode;
  intro?: ReactNode;
  /** Kept for compatibility: colours now follow the section's `data-surface`. */
  surface?: Surface;
}) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-4xl font-bold leading-[1.05] sm:text-5xl">{title}</h2>
      {intro && <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">{intro}</p>}
    </div>
  );
}

/** The page signature: an editor selection outline with square handles and a field tag. */
export function SelectionFrame({
  tag,
  className = "",
  children,
}: {
  tag?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const position = /\b(absolute|fixed)\b/.test(className) ? "" : "relative";
  return (
    <div className={`selection-frame ${position} ${className}`}>
      <span className="handle -left-[11px] -top-[11px]" aria-hidden="true" />
      <span className="handle -right-[11px] -top-[11px]" aria-hidden="true" />
      <span className="handle -bottom-[11px] -left-[11px]" aria-hidden="true" />
      <span className="handle -bottom-[11px] -right-[11px]" aria-hidden="true" />
      {tag && (
        <span className="absolute -top-9 left-[-7px] rounded-md bg-cobalt px-2 py-0.5 text-xs font-semibold text-white">
          {tag}
        </span>
      )}
      {children}
    </div>
  );
}
