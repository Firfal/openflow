"use client";

import { type ReactNode, useState } from "react";

/**
 * Wraps the hero demo and adds a pause button: motion that loops for more than 5 s next to other
 * content must be stoppable (WCAG 2.2.2). Both labels are rendered and stacked, like CopyButton,
 * so the button keeps its width. Hidden when the demo is static (editor, reduced motion).
 */
export function DemoToggle({
  pauseLabel,
  playLabel,
  hidden = false,
  children,
}: {
  pauseLabel: ReactNode;
  playLabel: ReactNode;
  hidden?: boolean;
  children: ReactNode;
}) {
  const [paused, setPaused] = useState(false);
  return (
    <div className="flex flex-col" data-paused={paused ? "" : undefined}>
      {children}
      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        className={`mt-5 items-center gap-2 self-end rounded-md px-2 py-1 text-sm text-white/60 transition-colors duration-150 hover:text-white motion-reduce:hidden ${hidden ? "hidden" : "inline-flex"}`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          {paused ? <path d="M4 2.5v11l9-5.5z" /> : <path d="M4 2.5h3v11H4zm5 0h3v11H9z" />}
        </svg>
        <span className="grid [&>span]:[grid-area:1/1]">
          <span className={paused ? "invisible" : ""}>{pauseLabel}</span>
          <span className={paused ? "" : "invisible"}>{playLabel}</span>
        </span>
      </button>
    </div>
  );
}
