import {
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "./icons.js";

export function Button({
  variant = "secondary",
  size,
  icon,
  busy,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "danger-ghost";
  size?: "sm" | "lg";
  icon?: IconName;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`of-btn of-btn--${variant}${size ? ` of-btn--${size}` : ""}${className ? ` ${className}` : ""}`}
    >
      {busy ? (
        <span className="of-spinner of-spinner--small" aria-hidden />
      ) : (
        icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />
      )}
      {children}
    </button>
  );
}

/** Square icon button: the label is its accessible name and tooltip. */
export function IconButton({
  icon,
  label,
  size,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconName;
  label: string;
  size?: "sm";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`of-icon-btn${size ? ` of-icon-btn--${size}` : ""}${className ? ` ${className}` : ""}`}
    >
      <Icon name={icon} size={size === "sm" ? 14 : 16} />
    </button>
  );
}

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="of-center" role="status">
      <span className="of-spinner" aria-hidden />
      <span>{label}</span>
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
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`of-dialog${wide ? " of-dialog--wide" : ""}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
    >
      <header className="of-dialog__header">
        <h2 id={titleId}>{title}</h2>
        <IconButton icon="x" label="Fermer" onClick={onClose} />
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

export type Tone = "green" | "grey" | "orange" | "red" | "blue";

export function StatusChip({
  tone,
  live,
  children,
}: {
  tone: Tone;
  /** Pulsing dot: work in progress. */
  live?: boolean;
  children: ReactNode;
}) {
  return <span className={`of-chip of-chip--${tone}${live ? " is-live" : ""}`}>{children}</span>;
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="of-empty">
      <span className="of-empty__icon">
        <Icon name={icon} size={20} />
      </span>
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: IconName;
  /** Secondary line (page path…). */
  hint?: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  /** Check mark (radio-like menus). */
  checked?: boolean;
}

export type MenuEntry = MenuItem | "separator" | { heading: string };

/**
 * Dropdown menu (menu button pattern): opens under its trigger, arrow keys move between items,
 * Escape or a click outside closes it and gives the focus back to the trigger.
 */
export function Menu({
  trigger,
  items,
  align = "right",
  direction = "down",
  label,
}: {
  trigger: (props: {
    ref: (node: HTMLButtonElement | null) => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
    onClick: () => void;
  }) => ReactNode;
  items: MenuEntry[];
  align?: "left" | "right";
  direction?: "down" | "up";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const first = list.current?.querySelector<HTMLElement>(
      "[role^='menuitem']:not(:disabled)[aria-checked='true'], [role^='menuitem']:not(:disabled)",
    );
    first?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open, close]);

  const onKeyDown = (event: KeyboardEvent) => {
    const entries = [
      ...(list.current?.querySelectorAll<HTMLElement>("[role^='menuitem']:not(:disabled)") ?? []),
    ];
    const index = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      entries[(index + delta + entries.length) % entries.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      entries[event.key === "Home" ? 0 : entries.length - 1]?.focus();
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  return (
    <div className="of-menu-anchor" ref={anchor}>
      {trigger({
        ref: (node) => {
          button.current = node;
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": id,
        onClick: () => setOpen((value) => !value),
      })}
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          className={`of-menu${align === "left" ? " of-menu--left" : ""}${direction === "up" ? " of-menu--up" : ""}`}
          onKeyDown={onKeyDown}
        >
          {items.map((item, index) => {
            if (item === "separator") return <div key={`sep-${index}`} className="of-menu__sep" />;
            if ("heading" in item) {
              return (
                <div key={`h-${item.heading}`} className="of-menu__label">
                  {item.heading}
                </div>
              );
            }
            const radio = item.checked !== undefined;
            const role = radio
              ? ({ role: "menuitemradio", "aria-checked": item.checked } as const)
              : ({ role: "menuitem" } as const);
            return (
              <button
                key={`${item.label}-${index}`}
                type="button"
                {...role}
                className={`of-menu__item${item.danger ? " of-menu__item--danger" : ""}`}
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.icon && <Icon name={item.icon} />}
                {item.hint ? (
                  <span className="of-menu__text">
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                  </span>
                ) : (
                  <span className="of-menu__text">{item.label}</span>
                )}
                {radio && <Icon name="check" className="of-menu__check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
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

/** `⌘` on Apple devices, `Ctrl` elsewhere (keyboard hints). */
export const MOD_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
