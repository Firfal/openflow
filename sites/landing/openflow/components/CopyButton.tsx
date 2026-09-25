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
}: {
  text: string;
  label: ReactNode;
  copiedLabel: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
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
