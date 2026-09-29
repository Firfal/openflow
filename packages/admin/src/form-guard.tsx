import { type ReactNode, useEffect, useRef } from "react";
import { useConfirm } from "./confirm.js";
import { setLeaveGuard } from "./context.js";

/**
 * A settings form with unsaved changes (they are saved with « Enregistrer », not as you type):
 * ⌘S / Ctrl+S saves, closing the tab warns, and leaving the view asks first. Render the returned
 * dialog in the form's view.
 */
export function useUnsavedGuard(dirty: boolean, save: () => void): ReactNode {
  const [dialog, ask] = useConfirm();
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
      }
    };
    const onUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    setLeaveGuard(() =>
      ask({
        title: "Quitter sans enregistrer ?",
        message: "Les modifications de ce formulaire seront perdues.",
        confirm: "Quitter sans enregistrer",
        danger: true,
      }),
    );
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
      setLeaveGuard(null);
    };
  }, [dirty, ask]);
  return dialog;
}

/** « Modifications non enregistrées », next to the form's « Enregistrer ». */
export function UnsavedNote({ dirty }: { dirty: boolean }) {
  return dirty ? (
    <span className="of-unsaved" role="status">
      Modifications non enregistrées
    </span>
  ) : null;
}
