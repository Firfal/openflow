"use client";

import { type ReactNode, useEffect, useState } from "react";

/**
 * Copies `text`. Both labels are always rendered and stacked, so the button keeps the width of
 * the longest one (no layout shift) and switches to `copiedLabel` for 2 s after a click.
 */
export function CopyButton({
  text,
  label,
  copiedLabel,
  editing = false,
}: {
  text: string;
  label: ReactNode;
  copiedLabel: ReactNode;
  /** In the editor, both labels are shown side by side so each can be edited in place. */
  editing?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  if (editing) {
    return (
      <span className="flex items-center gap-2 text-xs text-white">
        <span className="rounded-md bg-white/10 px-3 py-1.5">{label}</span>
        <span className="rounded-md bg-white/10 px-3 py-1.5">{copiedLabel}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
      className="btn grid min-h-9 rounded-md bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 [&>span]:[grid-area:1/1]"
    >
      {/* `invisible` also removes the inactive label from the accessibility tree. */}
      <span
        className={`transition-[opacity,visibility] duration-150 ${copied ? "invisible opacity-0" : ""}`}
      >
        {label}
      </span>
      <span
        className={`transition-[opacity,visibility] duration-150 ${copied ? "" : "invisible opacity-0"}`}
        aria-live="polite"
      >
        {copiedLabel}
      </span>
    </button>
  );
}
