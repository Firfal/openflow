import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "./icons.js";

/** Drag on a label to change a number (Webflow and Framer « scrub »). */
export interface Scrub {
  /** Value when the drag starts. */
  value: number;
  step: number;
  min?: number;
  /** `done` is false while dragging (not recorded in undo), true once, on release. */
  onChange: (value: number, done: boolean) => void;
}

function useScrub(scrub: Scrub | undefined) {
  const start = useRef<{ x: number; value: number; last?: number } | null>(null);
  if (!scrub) return {};
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      start.current = { x: event.clientX, value: scrub.value };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = start.current;
      if (!drag) return;
      const steps = Math.round((event.clientX - drag.x) / 3);
      if (steps === 0) return;
      const factor = event.shiftKey ? 10 : 1;
      let next = drag.value + steps * scrub.step * factor;
      if (scrub.min !== undefined) next = Math.max(scrub.min, next);
      next = Math.round(next * 1000) / 1000;
      if (next === drag.last) return;
      drag.last = next;
      scrub.onChange(next, false);
    },
    onPointerUp: () => {
      const last = start.current?.last;
      start.current = null;
      // One undo step for the whole gesture.
      if (last !== undefined) scrub.onChange(last, true);
    },
    style: { cursor: "ew-resize", touchAction: "none" } as const,
  };
}

/**
 * One row of the style panel (Webflow-like): label on the left, control on the right, and a reset
 * button when a value is set. The label is blue when this screen sets the value, amber when it is
 * inherited from a larger screen.
 */
export function StyleRow({
  label,
  set,
  inheritedFrom,
  onReset,
  children,
  hint,
  scrub,
}: {
  label: string;
  set: boolean;
  /** Screen the value comes from (« Ordinateur »…), when this one does not set it. */
  inheritedFrom?: string;
  onReset: () => void;
  children: (id: string) => ReactNode;
  hint?: ReactNode;
  scrub?: Scrub;
}) {
  const id = useId();
  const drag = useScrub(scrub);
  const inherited = !set && Boolean(inheritedFrom);
  return (
    <div className={`of-style-row${set ? " is-set" : ""}${inherited ? " is-inherited" : ""}`}>
      <label
        className="of-style-row__label"
        htmlFor={id}
        title={
          set
            ? "Réglé sur cet écran"
            : inherited
              ? `Hérité de l'écran ${inheritedFrom}`
              : scrub
                ? "Glisser pour changer la valeur"
                : undefined
        }
        {...drag}
      >
        {label}
      </label>
      <div className="of-style-row__control">{children(id)}</div>
      {set ? (
        <button
          type="button"
          className="of-style-row__reset"
          onClick={onReset}
          title="Revenir à la valeur héritée"
          aria-label={`Réinitialiser : ${label}`}
        >
          <Icon name="reset" size={12} />
        </button>
      ) : (
        <span className="of-style-row__reset" aria-hidden />
      )}
      {hint && <p className="of-style-row__hint">{hint}</p>}
    </div>
  );
}

const LENGTH = /^(-?\d*\.?\d*)(px|rem|em|%|vw|vh)$/;

function parseLength(value: string | undefined, fallbackUnit: string) {
  if (!value) return { n: "", unit: fallbackUnit };
  if (value === "0") return { n: "0", unit: fallbackUnit };
  const match = LENGTH.exec(value);
  if (match) return { n: match[1] ?? "", unit: match[2] ?? fallbackUnit };
  return { n: "", unit: value };
}

/** Number + unit (or a keyword such as `auto` / `none`). Only complete values are committed. */
export function LengthControl({
  id,
  value,
  placeholder,
  units = ["px", "rem", "%"],
  keywords = [],
  min,
  step = 1,
  onChange,
}: {
  id: string;
  value: string | undefined;
  placeholder?: string;
  units?: string[];
  keywords?: string[];
  min?: number;
  step?: number;
  onChange: (value: string | undefined) => void;
}) {
  const fallbackUnit = units[0] ?? "px";
  const parsed = parseLength(value, fallbackUnit);
  const [draft, setDraft] = useState(parsed.n);
  const [unit, setUnit] = useState(parsed.unit);
  // A new stored value (reset, undo, another screen) replaces the draft.
  useEffect(() => {
    const next = parseLength(value, fallbackUnit);
    setDraft(next.n);
    setUnit(next.unit);
  }, [value, fallbackUnit]);
  const keyword = keywords.includes(unit);
  const commit = (n: string, u: string) => {
    if (keywords.includes(u)) return onChange(u);
    if (n === "" || n === "-") return onChange(undefined);
    const number = Number(n);
    if (!Number.isFinite(number)) return;
    onChange(number === 0 ? "0" : `${number}${u}`);
  };
  return (
    <div className="of-length">
      <input
        id={id}
        className="of-input"
        type="number"
        inputMode="decimal"
        value={keyword ? "" : draft}
        placeholder={keyword ? "" : placeholder}
        disabled={keyword}
        min={min}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value, unit);
        }}
        onKeyDown={(e) => {
          if (!e.shiftKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
          e.preventDefault();
          const base = Number(draft || parseLength(placeholder, fallbackUnit).n || 0);
          const next = String(base + (e.key === "ArrowUp" ? 10 : -10) * step);
          setDraft(next);
          commit(next, unit);
        }}
      />
      <select
        className="of-input"
        aria-label="Unité"
        value={unit}
        onChange={(e) => {
          setUnit(e.target.value);
          commit(draft, e.target.value);
        }}
      >
        {units.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        {keywords.map((k) => (
          <option key={k} value={k}>
            {k === "auto" ? "auto" : k === "none" ? "aucune" : k}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NumberControl({
  id,
  value,
  placeholder,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  value: number | undefined;
  placeholder?: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  useEffect(() => setDraft(value === undefined ? "" : String(value)), [value]);
  return (
    <input
      id={id}
      className="of-input"
      type="number"
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        setDraft(e.target.value);
        if (e.target.value === "") return onChange(undefined);
        const n = Number(e.target.value);
        if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
      }}
    />
  );
}

/** Slider from 0 to 1, shown in percent. */
export function RangeControl({
  id,
  value,
  placeholder = 1,
  onChange,
}: {
  id: string;
  value: number | undefined;
  placeholder?: number;
  onChange: (value: number) => void;
}) {
  const current = value ?? placeholder;
  return (
    <div className="of-range">
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="of-range__value">{Math.round(current * 100)} %</span>
    </div>
  );
}

export function SelectControl<T extends string | number>({
  id,
  value,
  options,
  placeholder = "Hérité",
  onChange,
}: {
  id: string;
  value: T | undefined;
  options: Array<[T, string]>;
  placeholder?: string;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <select
      id={id}
      className="of-input"
      value={value === undefined ? "" : String(value)}
      onChange={(e) => {
        const option = options.find(([v]) => String(v) === e.target.value);
        onChange(option?.[0]);
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(([v, label]) => (
        <option key={String(v)} value={String(v)}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | undefined;
  /** Value, label, and an optional icon (then the label is the tooltip). */
  options: Array<[T, string] | [T, string, IconName]>;
  onChange: (value: T | undefined) => void;
  label: string;
}) {
  const icons = options.some((option) => option[2]);
  return (
    <fieldset
      className={`of-segmented of-segmented--small of-segmented--block${icons ? " of-segmented--icons" : ""}`}
    >
      <legend className="of-sr-only">{label}</legend>
      {options.map(([v, text, icon]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          aria-label={icon ? text : undefined}
          title={icon ? text : undefined}
          className={value === v ? "is-active" : ""}
          onClick={() => onChange(value === v ? undefined : v)}
        >
          {icon ? <Icon name={icon} size={14} /> : text}
        </button>
      ))}
    </fieldset>
  );
}

export interface Swatch {
  label: string;
  /** Stored value, e.g. `var(--color-ink)`. */
  value: string;
  /** Colour shown on the swatch. */
  color: string;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** `rgb(…)` / `#abc` / `#aabbccdd` to `#aabbcc` for `<input type="color">`. */
export function toHex6(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (HEX6.test(color)) return color.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i.exec(color);
  if (short)
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7).toLowerCase();
  const rgb = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(color);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((c) => Number(c).toString(16).padStart(2, "0"))
      .join("")}`;
  }
  return undefined;
}

export function ColorControl({
  id,
  value,
  placeholder,
  swatches,
  onChange,
}: {
  id: string;
  value: string | undefined;
  /** Current (inherited) colour, shown when no value is set. */
  placeholder?: string;
  swatches: Swatch[];
  onChange: (value: string | undefined) => void;
}) {
  const swatch = swatches.find((s) => s.value === value);
  const text = swatch ? swatch.label : (value ?? "");
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const shown = swatch?.color ?? value ?? placeholder;
  return (
    <div className="of-color">
      <div className="of-color__main">
        <input
          type="color"
          aria-label="Choisir une couleur"
          value={toHex6(shown) ?? "#000000"}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          id={id}
          className="of-input"
          value={draft}
          placeholder={toHex6(placeholder) ?? "Héritée"}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = e.target.value.trim();
            if (v === "") onChange(undefined);
            else if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) onChange(v);
          }}
        />
      </div>
      {swatches.length > 0 && (
        <div className="of-color__swatches">
          {swatches.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`of-swatch${s.value === value ? " is-active" : ""}`}
              style={{ background: s.color }}
              title={`${s.label} (couleur du thème)`}
              aria-label={`${s.label} (couleur du thème)`}
              aria-pressed={s.value === value}
              onClick={() => onChange(s.value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** WCAG contrast ratio of two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export type BoxSide = "top" | "right" | "bottom" | "left";

/** Parses what the owner typed in a box side: `24` → `24px`, `2rem`, `0`, `auto`. */
export function parseBoxValue(text: string, keywords: string[] = []): string | undefined | null {
  const value = text.trim().toLowerCase().replace(",", ".");
  if (value === "") return undefined;
  if (keywords.includes(value)) return value;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value) === 0 ? "0" : `${Number(value)}px`;
  if (/^-?\d+(\.\d+)?(px|rem|em|%|vw|vh)$/.test(value)) return value;
  return null;
}

function BoxInput({
  side,
  label,
  value,
  placeholder,
  state,
  keywords,
  onChange,
}: {
  side: BoxSide;
  label: string;
  value: string | undefined;
  placeholder?: string;
  state?: "set" | "inherited";
  keywords?: string[];
  onChange: (value: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const commit = () => {
    const parsed = parseBoxValue(draft, keywords);
    if (parsed === null) setDraft(value ?? "");
    else if (parsed !== value) onChange(parsed);
  };
  const short = (v?: string) => v?.replace(/px$/, "");
  return (
    <span className={`of-box__side of-box__side--${side}${state ? ` is-${state}` : ""}`}>
      <input
        className="of-input"
        aria-label={label}
        title={`${label} (ex. 24, 2rem)`}
        value={short(draft)}
        placeholder={short(placeholder) ?? "–"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const current = parseLength(parseBoxValue(draft || placeholder || "0") ?? "0", "px");
            const step = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1);
            const n = Number(current.n || 0) + step;
            // Margins (with keywords such as `auto`) may be negative, paddings may not.
            const next = n === 0 || (n < 0 && !keywords) ? "0" : `${n}${current.unit}`;
            setDraft(next);
            onChange(next);
          }
        }}
      />
    </span>
  );
}

/**
 * Box model (Webflow's spacing widget, simplified): the sides around a box, each a small input
 * accepting `24`, `2rem` or `0`. Only the sides passed in `sides` are editable.
 */
export function BoxControl({
  label,
  center,
  sides,
  keywords,
}: {
  label: string;
  center: string;
  sides: Partial<
    Record<
      BoxSide,
      {
        label: string;
        value: string | undefined;
        placeholder?: string;
        state?: "set" | "inherited";
        onChange: (value: string | undefined) => void;
      }
    >
  >;
  keywords?: string[];
}) {
  return (
    <fieldset className="of-box">
      <legend className="of-sr-only">{label}</legend>
      {(["top", "left", "right", "bottom"] as const).map((side) => {
        const item = sides[side];
        return item ? (
          <BoxInput key={side} side={side} keywords={keywords} {...item} />
        ) : (
          <span key={side} className={`of-box__side of-box__side--${side}`} />
        );
      })}
      <span className="of-box__center">{center}</span>
    </fieldset>
  );
}
