import { type ReactNode, useCallback, useRef, useState } from "react";
import { Button, Dialog } from "./ui.js";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  /** Label of the confirming button, specific to the action (« Supprimer », « Déconnecter »). */
  confirm: string;
  /** A destructive action: the button is red. */
  danger?: boolean;
}

/**
 * `window.confirm`, as an admin dialog (keyboard, focus and dark mode like the others):
 * `const [dialog, ask] = useConfirm();` render `{dialog}`, then `if (!(await ask({ … }))) return;`.
 */
export function useConfirm(): [ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | undefined>(undefined);

  const ask = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setPending(options);
      }),
    [],
  );
  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = undefined;
    setPending(null);
  };

  const dialog = (
    <Dialog
      open={pending !== null}
      title={pending?.title ?? ""}
      onClose={() => close(false)}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Annuler
          </Button>
          <Button variant={pending?.danger ? "danger" : "primary"} onClick={() => close(true)}>
            {pending?.confirm}
          </Button>
        </>
      }
    >
      <p>{pending?.message}</p>
    </Dialog>
  );
  return [dialog, ask];
}
