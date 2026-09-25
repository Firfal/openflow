import type { Field } from "@puckeditor/core";
import type { ReactNode } from "react";

/** Background of a section, chosen by the owner. */
export type Tone = "light" | "muted" | "dark" | "accent";

export const toneField: Field<Tone> = {
  type: "radio",
  label: "Fond",
  options: [
    { label: "Clair", value: "light" },
    { label: "Gris", value: "muted" },
    { label: "Sombre", value: "dark" },
    { label: "Couleur", value: "accent" },
  ],
};

const TONES: Record<Tone, string> = {
  light: "bg-white text-stone-900",
  muted: "bg-stone-100 text-stone-900",
  dark: "bg-stone-900 text-stone-50",
  accent: "bg-accent text-white",
};

export function Section({
  tone = "light",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${TONES[tone] ?? TONES.light} px-6 py-20 sm:py-24 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/** Primary button style adapted to the section background. */
export function buttonClass(tone: Tone, variant: "primary" | "secondary" = "primary"): string {
  const base =
    "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition";
  if (variant === "secondary") {
    return `${base} ring-1 ring-inset ${tone === "dark" || tone === "accent" ? "ring-white/40 hover:bg-white/10" : "ring-stone-300 hover:bg-stone-50"}`;
  }
  return tone === "accent"
    ? `${base} bg-white text-accent hover:bg-stone-100`
    : `${base} bg-accent text-white hover:opacity-90`;
}

export type IconName = "star" | "leaf" | "heart" | "clock" | "shield" | "sparkles";

export const iconField: Field<IconName> = {
  type: "select",
  label: "Icône",
  options: [
    { label: "Étoile", value: "star" },
    { label: "Feuille", value: "leaf" },
    { label: "Cœur", value: "heart" },
    { label: "Horloge", value: "clock" },
    { label: "Bouclier", value: "shield" },
    { label: "Étincelles", value: "sparkles" },
  ],
};

const ICON_PATHS: Record<IconName, string> = {
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  leaf: "M5 19c8 0 14-6 14-14-8 0-14 6-14 14zm0 0l7-7",
  heart: "M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zm0-13v4l3 2",
  shield: "M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z",
  sparkles: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2 2m8 8l2 2m0-12l-2 2M8 16l-2 2",
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name] ?? ICON_PATHS.star} />
    </svg>
  );
}
