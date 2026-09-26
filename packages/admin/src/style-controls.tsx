import { type ReactNode, useEffect, useId, useState } from "react";

/** One row of the style panel: label, control, and a reset button when a value is set. */
export function StyleRow({
  label,
  set,
  onReset,
  children,
  hint,
}: {
  label: string;
  set: boolean;
  onReset: () => void;
  children: (id: string) => ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`of-style-row${set ? " is-set" : ""}`}>
      <label className="of-style-row__label" htmlFor={id}>
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
          ×
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
  options: Array<[T, string]>;
  onChange: (value: T | undefined) => void;
  label: string;
}) {
  return (
    <fieldset className="of-segmented of-segmented--small">
      <legend className="of-sr-only">{label}</legend>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          className={value === v ? "is-active" : ""}
          onClick={() => onChange(value === v ? undefined : v)}
        >
          {text}
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
