"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Looping, muted video of the hero. It starts paused for visitors who prefer reduced motion, and
 * a pause button is always available (WCAG 2.2.2). Both labels are rendered and stacked so the
 * button keeps its width; in the editor, the video stays paused and both labels are shown.
 */
export function HeroVideo({
  video,
  pauseLabel,
  playLabel,
  editing = false,
}: {
  video: { src?: string; poster?: string; "aria-label"?: string } & Record<string, unknown>;
  pauseLabel: ReactNode;
  playLabel: ReactNode;
  editing?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(editing);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (editing || reduce) {
      element.pause();
      setPaused(true);
    } else {
      void element.play().catch(() => setPaused(true));
    }
  }, [editing]);

  const toggle = () => {
    const element = ref.current;
    if (!element) return;
    if (element.paused) {
      void element.play();
      setPaused(false);
    } else {
      element.pause();
      setPaused(true);
    }
  };

  return (
    <div className="flex flex-col">
      <video
        {...video}
        ref={ref}
        muted
        loop
        playsInline
        preload="metadata"
        className="w-full rounded-2xl shadow-[0_50px_120px_-30px_rgb(0_0_0/0.75)] ring-1 ring-white/10"
      />
      <button
        type="button"
        onClick={toggle}
        className="mt-5 inline-flex items-center gap-2 self-end rounded-md px-2 py-1 text-sm text-white/60 transition-colors duration-150 hover:text-white"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          {paused ? <path d="M4 2.5v11l9-5.5z" /> : <path d="M4 2.5h3v11H4zm5 0h3v11H9z" />}
        </svg>
        {editing ? (
          <span className="flex gap-2">
            <span>{pauseLabel}</span>
            <span aria-hidden="true">/</span>
            <span>{playLabel}</span>
          </span>
        ) : (
          <span className="grid [&>span]:[grid-area:1/1]">
            <span className={paused ? "invisible" : ""}>{pauseLabel}</span>
            <span className={paused ? "" : "invisible"}>{playLabel}</span>
          </span>
        )}
      </button>
    </div>
  );
}
