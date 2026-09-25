import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "saved" | "pending" | "saving" | "error";

/** Flush functions of every mounted autosaver, so "Publier" never misses a pending edit. */
const flushers = new Set<() => Promise<void>>();

export async function flushAllAutosaves(): Promise<void> {
  await Promise.all([...flushers].map((flush) => flush()));
}

/**
 * Debounced autosave. `schedule(value)` saves after `delay` ms of inactivity; `flush()` saves
 * immediately. Pending changes are flushed on unmount and a warning is shown on tab close.
 */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, delay = 800) {
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string>();
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const running = useRef<Promise<void>>(Promise.resolve());
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    await running.current;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setState("saving");
    running.current = saveRef
      .current(next.value)
      .then(() => {
        setError(undefined);
        setState(pending.current ? "pending" : "saved");
      })
      .catch((e: unknown) => {
        pending.current ??= next;
        setError((e as Error).message);
        setState("error");
      });
    await running.current;
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      setState("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    flushers.add(flush);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current) {
        event.preventDefault();
        void flush();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      flushers.delete(flush);
      window.removeEventListener("beforeunload", beforeUnload);
      void flush();
    };
  }, [flush]);

  return { state, error, schedule, flush };
}
