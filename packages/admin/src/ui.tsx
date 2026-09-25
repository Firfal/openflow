import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef } from "react";

export function Button({
  variant = "secondary",
  busy,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={`of-btn of-btn--${variant}${className ? ` ${className}` : ""}`}
    >
      {busy && <span className="of-spinner of-spinner--small" aria-hidden />}
      {children}
    </button>
  );
}

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="of-center" role="status">
      <span className="of-spinner" aria-hidden />
      <span className="of-muted">{label}</span>
    </div>
  );
}

/** Accessible modal built on the native `<dialog>` element. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="of-dialog" onClose={onClose} onCancel={onClose}>
      <header className="of-dialog__header">
        <h2>{title}</h2>
        <button type="button" className="of-icon-btn" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </header>
      <div className="of-dialog__body">{children}</div>
      {footer && <footer className="of-dialog__footer">{footer}</footer>}
    </dialog>
  );
}

export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="of-field">
      <span className="of-field__label">{label}</span>
      {children}
      {hint && !error && <span className="of-field__hint">{hint}</span>}
      {error && <span className="of-field__error">{error}</span>}
    </label>
  );
}

export function StatusChip({
  tone,
  children,
}: {
  tone: "green" | "grey" | "orange" | "red" | "blue";
  children: ReactNode;
}) {
  return <span className={`of-chip of-chip--${tone}`}>{children}</span>;
}

const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

/** "il y a 5 minutes", "hier"… */
export function timeAgo(iso: string | undefined): string {
  if (!iso) return "—";
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "à l'instant";
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}
