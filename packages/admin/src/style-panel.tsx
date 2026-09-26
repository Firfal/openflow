import {
  type Breakpoint,
  breakpointForWidth,
  getOpenFlowFieldKind,
  type ResponsiveStyle,
  type SectionStyle,
  STYLE_KEY,
  type StyleProperty,
  type StyleValues,
  sanitizeStyle,
} from "@openflow/core";
import { createUsePuck, type Fields } from "@puckeditor/core";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useAdmin } from "./context.js";
import { resolveField, useFocus } from "./focus.js";
import { Icon, type IconName } from "./icons.js";
import { MediaLibrary } from "./media.js";
import {
  BoxControl,
  ColorControl,
  contrastRatio,
  LengthControl,
  NumberControl,
  RangeControl,
  type Scrub,
  SegmentedControl,
  SelectControl,
  StyleRow,
  type Swatch,
  toHex6,
} from "./style-controls.js";
import { Button } from "./ui.js";

const usePuck = createUsePuck();

/** Screens of the editor (Puck viewports): the style panel edits the one shown. */
export const SCREENS: Array<{ bp: Breakpoint; label: string; width: number; icon: IconName }> = [
  { bp: "base", label: "Ordinateur", width: 1280, icon: "monitor" },
  { bp: "tablet", label: "Tablette", width: 768, icon: "tablet" },
  { bp: "mobile", label: "Mobile", width: 390, icon: "smartphone" },
];

type Target = "section" | "text" | "media";

const GENERIC_FONTS: Array<[string, string]> = [
  ["system-ui", "Police du système"],
  ["sans-serif", "Sans empattement"],
  ["serif", "Avec empattement"],
  ["monospace", "Chasse fixe"],
];

const WEIGHTS: Array<[number, string]> = [
  [300, "Légère"],
  [400, "Normale"],
  [500, "Moyenne"],
  [600, "Demi-grasse"],
  [700, "Grasse"],
  [800, "Extra-grasse"],
  [900, "Noire"],
];

/** The element of the page being styled, in the canvas iframe (to show current values). */
function findElements(componentId: string, path: string | undefined, index: string | undefined) {
  const doc = document.querySelector<HTMLIFrameElement>("#preview-frame")?.contentDocument;
  const scope = doc?.querySelector(`[data-of-s="${CSS.escape(componentId)}"]`);
  if (!scope) return {};
  if (!path) {
    const root = scope.firstElementChild ?? undefined;
    return { inline: root, box: root };
  }
  const selector = `[data-of="${CSS.escape(path)}"]${index ? `[data-of-i="${CSS.escape(index)}"]` : ""}`;
  const marked =
    scope.querySelector(selector) ?? scope.querySelector(`[data-of="${CSS.escape(path)}"]`);
  if (!marked) return {};
  const media = marked.tagName === "IMG" || marked.tagName === "VIDEO";
  return { inline: marked, box: media ? marked : (marked.parentElement ?? undefined) };
}

let canvas: CanvasRenderingContext2D | null | undefined;

/** Any computed CSS colour (Tailwind v4 uses `oklch`) as `#rrggbb` + alpha, via a 1×1 canvas. */
function toRgba(color: string): { hex: string; alpha: number } | undefined {
  canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!canvas) return undefined;
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillStyle = "#000000";
  canvas.fillStyle = color;
  canvas.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = canvas.getImageData(0, 0, 1, 1).data;
  const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  return { hex, alpha: a / 255 };
}

interface Computed {
  color?: string;
  background?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  textAlign?: string;
  bold: boolean;
}

function readComputed(inline?: Element, box?: Element): Computed | undefined {
  if (!inline || !box) return undefined;
  const view = inline.ownerDocument.defaultView;
  if (!view) return undefined;
  const text = view.getComputedStyle(inline);
  const block = view.getComputedStyle(box);
  // Effective background: first opaque colour up the tree (unknown under an image).
  let background: string | undefined;
  for (let el: Element | null = box; el; el = el.parentElement) {
    const style = view.getComputedStyle(el);
    if (style.backgroundImage !== "none") break;
    const bg = toRgba(style.backgroundColor);
    if (bg && bg.alpha >= 0.99) {
      background = bg.hex;
      break;
    }
  }
  return {
    color: toRgba(text.color)?.hex,
    background,
    fontSize: text.fontSize,
    fontWeight: text.fontWeight,
    lineHeight: block.lineHeight,
    textAlign: block.textAlign,
    bold: Number(text.fontWeight) >= 700,
  };
}

function Group({
  title,
  active,
  children,
}: {
  title: string;
  /** This screen sets values in the group: a dot next to the title. */
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="of-style-group" open>
      <summary>
        {title}
        {active && <span className="of-style-group__dot" title="Réglages sur cet écran" />}
        <Icon name="chevronDown" size={14} className="of-style-group__chevron" />
      </summary>
      <div className="of-style-group__body">{children}</div>
    </details>
  );
}

const GROUPS = {
  typography: [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textAlign",
    "textTransform",
    "fontStyle",
    "textDecoration",
  ],
  colors: [
    "color",
    "backgroundColor",
    "backgroundImage",
    "overlayColor",
    "overlayOpacity",
    "backgroundPosition",
    "backgroundSize",
  ],
  spacing: [
    "marginTop",
    "marginBottom",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
  ],
  size: ["maxWidth", "minHeight"],
  effects: ["borderWidth", "borderColor", "borderRadius", "shadow", "opacity", "objectFit"],
  visibility: ["hidden"],
} satisfies Record<string, StyleProperty[]>;

/** Number and unit of a stored length (`24px` → 24, `px`), for scrubbing. */
function lengthParts(value: string | undefined): { n: number; unit: string } | undefined {
  const match = /^(-?\d*\.?\d+)(px|rem|em|%|vw|vh)$/.exec(value ?? "");
  if (match) return { n: Number(match[1]), unit: match[2] ?? "px" };
  return value === "0" ? { n: 0, unit: "px" } : undefined;
}

/**
 * « Style » tab: free style of the selected section or of the clicked element, per screen.
 * Values are stored in the section's `_style` prop through Puck's `replace` action (undoable,
 * autosaved) and rendered by `buildPageCss`, as on the published site.
 */
export function StylePanel() {
  const { config, settings } = useAdmin();
  const { focus, setFocus } = useFocus();
  const selected = usePuck((s) => s.selectedItem);
  const puckConfig = usePuck((s) => s.config);
  const dispatch = usePuck((s) => s.dispatch);
  const getSelectorForId = usePuck((s) => s.getSelectorForId);
  const viewports = usePuck((s) => s.appState.ui.viewports);
  const [library, setLibrary] = useState(false);
  const [computed, setComputed] = useState<Computed>();

  const selectedId = selected?.props.id as string | undefined;
  const width = typeof viewports.current.width === "number" ? viewports.current.width : 1280;
  const bp = breakpointForWidth(width);
  const onElement = Boolean(focus?.path && focus.componentId === selectedId);
  const component = selected ? puckConfig.components[selected.type] : undefined;
  const resolved =
    onElement && focus?.path
      ? resolveField(component?.fields as Fields | undefined, focus.path, focus.index)
      : undefined;
  const fieldKind = resolved ? getOpenFlowFieldKind(resolved.field) : undefined;
  const target: Target = !onElement
    ? "section"
    : fieldKind === "image" || fieldKind === "video"
      ? "media"
      : "text";
  const path = onElement ? focus?.path : undefined;
  const styleProp = selected?.props[STYLE_KEY];

  // Current values of the element on the page (placeholders, contrast), read after each render
  // of the canvas, and again once a screen change has resized it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read when the style or the screen changes the page.
  useEffect(() => {
    if (!selectedId) return;
    const read = () => {
      const { inline, box } = findElements(selectedId, path, focus?.index);
      setComputed(readComputed(inline, box));
    };
    const raf = requestAnimationFrame(read);
    const late = setTimeout(read, 400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(late);
    };
  }, [selectedId, path, focus?.index, styleProp, width]);

  const swatches = useMemo<Swatch[]>(
    () =>
      (config.theme?.colors ?? []).map((token) => ({
        label: token.label,
        value: `var(--color-${token.token})`,
        color: settings?.theme?.[`color-${token.token}`] ?? token.value,
      })),
    [config.theme, settings?.theme],
  );
  const fonts = useMemo<Array<[string, string]>>(
    () => [
      ...(config.theme?.fonts ?? []).map(
        (token) => [`var(--font-${token.token})`, `${token.label} (thème)`] as [string, string],
      ),
      ...(config.theme?.fontOptions ?? []).map((f) => [f.value, f.label] as [string, string]),
      ...GENERIC_FONTS,
    ],
    [config.theme],
  );

  if (!selected || !selectedId) {
    return <p className="of-style-empty">Cliquez sur une section ou un élément de la page.</p>;
  }

  const style: SectionStyle = sanitizeStyle(styleProp) ?? {};
  const responsive: ResponsiveStyle = (path ? style.fields?.[path] : style.section) ?? {};
  const values: StyleValues = responsive[bp] ?? {};
  const inherited: StyleValues =
    bp === "base"
      ? {}
      : bp === "tablet"
        ? { ...responsive.base }
        : { ...responsive.base, ...responsive.tablet };

  const commit = (nextResponsive: ResponsiveStyle, record = true) => {
    const next: SectionStyle = path
      ? { ...style, fields: { ...style.fields, [path]: nextResponsive } }
      : { ...style, section: nextResponsive };
    const clean = sanitizeStyle(next);
    const props: typeof selected.props = { ...selected.props };
    if (clean) props[STYLE_KEY] = clean;
    else delete props[STYLE_KEY];
    const selector = getSelectorForId(selectedId);
    if (!selector) return;
    dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...selected, props },
      recordHistory: record,
    });
  };
  const set = <K extends StyleProperty>(
    key: K,
    value: StyleValues[K] | undefined,
    record = true,
  ) => {
    const next: StyleValues = { ...values };
    if (value === undefined) delete next[key];
    else next[key] = value;
    commit({ ...responsive, [bp]: next }, record);
  };
  const setMany = (patch: Partial<StyleValues>) => {
    const next: Record<string, unknown> = { ...values };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    commit({ ...responsive, [bp]: next as StyleValues });
  };

  /** Screen a value comes from, when this screen inherits it (Webflow's amber labels). */
  const sourceOf = (key: StyleProperty): string | undefined => {
    if (values[key] !== undefined || bp === "base") return undefined;
    if (bp === "mobile" && responsive.tablet?.[key] !== undefined) return "Tablette";
    return responsive.base?.[key] !== undefined ? "Ordinateur" : undefined;
  };
  const sideState = (key: StyleProperty) =>
    values[key] !== undefined
      ? ("set" as const)
      : sourceOf(key)
        ? ("inherited" as const)
        : undefined;
  const active = (keys: StyleProperty[]) => keys.some((key) => values[key] !== undefined);
  const row = <K extends StyleProperty>(
    key: K,
    label: string,
    control: (id: string, value: StyleValues[K] | undefined) => ReactNode,
    hint?: ReactNode,
    scrub?: Scrub,
  ) => (
    <StyleRow
      key={key}
      label={label}
      set={values[key] !== undefined}
      inheritedFrom={sourceOf(key)}
      onReset={() => set(key, undefined)}
      hint={hint}
      scrub={scrub}
    >
      {(id) => control(id, values[key])}
    </StyleRow>
  );
  /** Scrubbing a length from its label (current value, else the inherited or computed one). */
  const lengthScrub = (key: StyleProperty, current?: string, step = 1): Scrub | undefined => {
    const parts = lengthParts(values[key] as string | undefined) ??
      lengthParts(inherited[key] as string | undefined) ??
      lengthParts(current) ?? { n: 0, unit: "px" };
    // Whole pixels, percents and viewport units; fine steps for relative units.
    const relative = parts.unit === "rem" || parts.unit === "em";
    const unitStep = relative ? (key === "letterSpacing" ? 0.01 : 0.05) : step;
    return {
      value: parts.n,
      step: unitStep,
      min: key === "letterSpacing" || key.startsWith("margin") ? undefined : 0,
      onChange: (n, done) => set(key, (n === 0 ? "0" : `${n}${parts.unit}`) as never, done),
    };
  };
  const placeholder = (key: StyleProperty, current?: string) => {
    const value = inherited[key];
    return value !== undefined ? String(value) : current;
  };
  const length = (
    key: StyleProperty,
    label: string,
    options: { keywords?: string[]; units?: string[]; current?: string } = {},
  ) =>
    row(
      key,
      label,
      (id, value) => (
        <LengthControl
          id={id}
          value={value as string | undefined}
          placeholder={placeholder(key, options.current)}
          keywords={options.keywords}
          units={options.units}
          onChange={(v) => set(key, v as never)}
        />
      ),
      undefined,
      lengthScrub(key, options.current),
    );
  const side = (key: StyleProperty, label: string) => ({
    label,
    value: values[key] as string | undefined,
    placeholder: inherited[key] as string | undefined,
    state: sideState(key),
    onChange: (v: string | undefined) => set(key, v as never),
  });

  const screen = SCREENS.find((s) => s.bp === bp) ?? SCREENS[0]!;
  const setScreen = (next: (typeof SCREENS)[number]) =>
    dispatch({
      type: "setUi",
      ui: { viewports: { ...viewports, current: { width: next.width, height: "auto" } } },
    });

  const sectionLabel = component?.label ?? selected.type;
  const text = target !== "media";
  const textColor = values.color ?? inherited.color;
  let contrast: { ratio: number; ok: boolean; large: boolean } | undefined;
  const fg = toHex6(computed?.color);
  const bg = toHex6(computed?.background);
  if (target === "text" && fg && bg) {
    const size = Number.parseFloat(computed?.fontSize ?? "16");
    const large = size >= 24 || (size >= 18.66 && Boolean(computed?.bold));
    const ratio = contrastRatio(fg, bg);
    contrast = { ratio, ok: ratio >= (large ? 3 : 4.5), large };
  }
  const isList = Boolean(path && focus?.index);

  return (
    <div className="of-style">
      <nav className="of-style__crumbs" aria-label="Élément stylé">
        <button
          type="button"
          className={target === "section" ? "is-current" : ""}
          onClick={() => setFocus({ componentId: selectedId })}
        >
          {sectionLabel}
        </button>
        {resolved && (
          <>
            <span aria-hidden>›</span>
            <span className="is-current">{resolved.label}</span>
          </>
        )}
      </nav>

      <fieldset className="of-segmented of-segmented--small of-style__screens">
        <legend className="of-sr-only">Écran</legend>
        {SCREENS.map((s) => (
          <button
            key={s.bp}
            type="button"
            aria-pressed={s.bp === bp}
            className={s.bp === bp ? "is-active" : ""}
            onClick={() => setScreen(s)}
          >
            <Icon name={s.icon} size={13} />
            {s.label}
          </button>
        ))}
      </fieldset>
      <p className="of-style__note">
        <Icon name="info" size={13} className="of-icon--first-line" />
        <span>
          {bp === "base"
            ? "Pour tous les écrans : la tablette et le mobile peuvent changer ces réglages."
            : `Seulement sur ${screen.label.toLowerCase()}. En orange : valeurs reprises d'un écran plus grand.`}
          {isList && " S'applique à tous les éléments de la liste."}
        </span>
      </p>

      {text && (
        <Group title="Typographie" active={active(GROUPS.typography)}>
          {row("fontFamily", "Police", (id, value) => (
            <SelectControl
              id={id}
              value={value}
              options={fonts}
              onChange={(v) => set("fontFamily", v)}
            />
          ))}
          {length("fontSize", "Taille", {
            units: ["px", "rem", "em"],
            current: computed?.fontSize,
          })}
          {row("fontWeight", "Graisse", (id, value) => (
            <SelectControl
              id={id}
              value={value}
              options={WEIGHTS}
              placeholder={computed?.fontWeight ? `Héritée (${computed.fontWeight})` : "Héritée"}
              onChange={(v) => set("fontWeight", v)}
            />
          ))}
          {row(
            "lineHeight",
            "Interligne",
            (id, value) => (
              <NumberControl
                id={id}
                value={value}
                min={0.5}
                max={4}
                step={0.05}
                placeholder={placeholder("lineHeight", "ex. 1,4")}
                onChange={(v) => set("lineHeight", v)}
              />
            ),
            undefined,
            {
              value: values.lineHeight ?? inherited.lineHeight ?? 1.4,
              step: 0.05,
              min: 0.5,
              onChange: (n, done) => set("lineHeight", Math.min(4, Math.max(0.5, n)), done),
            },
          )}
          {length("letterSpacing", "Lettres", { units: ["em", "px"] })}
          {row("textAlign", "Alignement", (_id, value) => (
            <SegmentedControl
              label="Alignement"
              value={value}
              options={[
                ["left", "Gauche", "alignLeft"],
                ["center", "Centre", "alignCenter"],
                ["right", "Droite", "alignRight"],
                ["justify", "Justifié", "alignJustify"],
              ]}
              onChange={(v) => set("textAlign", v)}
            />
          ))}
          {row("textTransform", "Casse", (id, value) => (
            <SelectControl
              id={id}
              value={value}
              options={[
                ["none", "Normale"],
                ["uppercase", "MAJUSCULES"],
                ["lowercase", "minuscules"],
                ["capitalize", "Première Lettre"],
              ]}
              onChange={(v) => set("textTransform", v)}
            />
          ))}
          {row("fontStyle", "Style", (_id, value) => (
            <SegmentedControl
              label="Style"
              value={value}
              options={[
                ["normal", "Droit"],
                ["italic", "Italique"],
              ]}
              onChange={(v) => set("fontStyle", v)}
            />
          ))}
          {row("textDecoration", "Trait", (id, value) => (
            <SelectControl
              id={id}
              value={value}
              options={[
                ["none", "Aucun"],
                ["underline", "Souligné"],
                ["line-through", "Barré"],
              ]}
              onChange={(v) => set("textDecoration", v)}
            />
          ))}
        </Group>
      )}

      <Group
        title={target === "section" ? "Couleurs et fond" : "Couleurs"}
        active={active(GROUPS.colors)}
      >
        {text &&
          row(
            "color",
            "Couleur du texte",
            (id, value) => (
              <ColorControl
                id={id}
                value={value}
                placeholder={textColor ?? computed?.color}
                swatches={swatches}
                onChange={(v) => set("color", v)}
              />
            ),
            contrast && (
              <span className={`of-contrast ${contrast.ok ? "is-ok" : "is-low"}`}>
                Contraste {contrast.ratio.toFixed(1).replace(".", ",")}:1 ·{" "}
                {contrast.ok
                  ? "lisible (AA)"
                  : `insuffisant : ${contrast.large ? "3" : "4,5"}:1 minimum`}
              </span>
            ),
          )}
        {row("backgroundColor", "Couleur de fond", (id, value) => (
          <ColorControl
            id={id}
            value={value}
            placeholder={inherited.backgroundColor}
            swatches={swatches}
            onChange={(v) => set("backgroundColor", v)}
          />
        ))}
        {target === "section" && (
          <>
            <StyleRow
              label="Image de fond"
              set={values.backgroundImage !== undefined}
              onReset={() =>
                setMany({
                  backgroundImage: undefined,
                  overlayColor: undefined,
                  overlayOpacity: undefined,
                })
              }
            >
              {(id) => (
                <div className="of-bg-image">
                  {(values.backgroundImage ?? inherited.backgroundImage) && (
                    <img src={values.backgroundImage ?? inherited.backgroundImage} alt="" />
                  )}
                  <Button id={id} size="sm" icon="image" onClick={() => setLibrary(true)}>
                    {values.backgroundImage ? "Remplacer le fond" : "Choisir une image"}
                  </Button>
                </div>
              )}
            </StyleRow>
            {(values.backgroundImage ?? inherited.backgroundImage) && (
              <>
                {row("overlayColor", "Voile (couleur)", (id, value) => (
                  <ColorControl
                    id={id}
                    value={value}
                    placeholder={inherited.overlayColor}
                    swatches={swatches}
                    onChange={(v) => set("overlayColor", v)}
                  />
                ))}
                {row("overlayOpacity", "Voile (opacité)", (id, value) => (
                  <RangeControl
                    id={id}
                    value={value}
                    placeholder={inherited.overlayOpacity ?? 0.5}
                    onChange={(v) => set("overlayOpacity", v)}
                  />
                ))}
                {row("backgroundPosition", "Cadrage", (id, value) => (
                  <SelectControl
                    id={id}
                    value={value}
                    options={[
                      ["center", "Centré"],
                      ["top", "En haut"],
                      ["bottom", "En bas"],
                      ["left", "À gauche"],
                      ["right", "À droite"],
                    ]}
                    onChange={(v) => set("backgroundPosition", v)}
                  />
                ))}
                {row("backgroundSize", "Taille", (id, value) => (
                  <SelectControl
                    id={id}
                    value={value}
                    options={[
                      ["cover", "Remplir"],
                      ["contain", "Adapter"],
                      ["auto", "Taille réelle"],
                    ]}
                    onChange={(v) => set("backgroundSize", v)}
                  />
                ))}
              </>
            )}
            <MediaLibrary
              open={library}
              onClose={() => setLibrary(false)}
              onPick={(media) => {
                setLibrary(false);
                const url = media.url.startsWith("/") ? encodeURI(decodeURI(media.url)) : media.url;
                setMany({
                  backgroundImage: url,
                  overlayColor: values.overlayColor ?? inherited.overlayColor ?? "#000000",
                  overlayOpacity: values.overlayOpacity ?? inherited.overlayOpacity ?? 0.4,
                });
              }}
            />
          </>
        )}
      </Group>

      <Group title="Espacements" active={active(GROUPS.spacing)}>
        {target !== "section" && (
          <BoxControl
            label="Espace autour"
            center="Espace autour"
            keywords={["auto"]}
            sides={{
              top: side("marginTop", "Espace au-dessus"),
              bottom: side("marginBottom", "Espace au-dessous"),
            }}
          />
        )}
        {target !== "media" && (
          <BoxControl
            label="Marges intérieures"
            center={target === "section" ? "Section" : "Marges intérieures"}
            sides={{
              top: side("paddingTop", "Marge intérieure en haut"),
              right: side("paddingRight", "Marge intérieure à droite"),
              bottom: side("paddingBottom", "Marge intérieure en bas"),
              left: side("paddingLeft", "Marge intérieure à gauche"),
            }}
          />
        )}
        <p className="of-style-row__hint of-subtle" style={{ fontSize: 11.5 }}>
          En pixels (24), ou avec une unité (2rem). ↑ ↓ pour ajuster, ⇧ pour aller plus vite.
        </p>
      </Group>

      <Group title="Dimensions" active={active(GROUPS.size)}>
        {length("maxWidth", "Largeur maximale", { keywords: ["none"], units: ["px", "%", "rem"] })}
        {target === "section" &&
          length("minHeight", "Hauteur minimale", { units: ["px", "vh", "rem"] })}
      </Group>

      <Group title="Bordure et effets" active={active(GROUPS.effects)}>
        {length("borderWidth", "Épaisseur de bordure", { units: ["px"] })}
        {row("borderColor", "Couleur de bordure", (id, value) => (
          <ColorControl
            id={id}
            value={value}
            swatches={swatches}
            onChange={(v) => set("borderColor", v)}
          />
        ))}
        {length("borderRadius", "Arrondi des coins", { units: ["px", "%", "rem"] })}
        {row("shadow", "Ombre", (id, value) => (
          <SelectControl
            id={id}
            value={value}
            options={[
              ["none", "Aucune"],
              ["sm", "Légère"],
              ["md", "Moyenne"],
              ["lg", "Forte"],
            ]}
            onChange={(v) => set("shadow", v)}
          />
        ))}
        {row("opacity", "Opacité", (id, value) => (
          <RangeControl
            id={id}
            value={value}
            placeholder={inherited.opacity ?? 1}
            onChange={(v) => set("opacity", v)}
          />
        ))}
        {target === "media" &&
          row("objectFit", "Recadrage", (id, value) => (
            <SelectControl
              id={id}
              value={value}
              options={[
                ["cover", "Remplir le cadre"],
                ["contain", "Image entière"],
                ["fill", "Étirer"],
              ]}
              onChange={(v) => set("objectFit", v)}
            />
          ))}
      </Group>

      <Group title="Visibilité" active={active(GROUPS.visibility)}>
        {row("hidden", `Masquer sur l'écran ${screen.label.toLowerCase()}`, (id, value) => (
          <input
            id={id}
            type="checkbox"
            className="of-style-check"
            checked={Boolean(value ?? inherited.hidden)}
            // Unchecking on a smaller screen shows again what a larger one hides.
            onChange={(e) =>
              set("hidden", e.target.checked ? true : inherited.hidden ? false : undefined)
            }
          />
        ))}
      </Group>

      <div className="of-style__footer">
        <Button
          variant="ghost"
          size="sm"
          icon="reset"
          disabled={Object.keys(values).length === 0}
          onClick={() => commit({ ...responsive, [bp]: {} })}
        >
          Réinitialiser cet écran
        </Button>
        <Button
          variant="danger-ghost"
          size="sm"
          disabled={Object.keys(responsive).length === 0}
          onClick={() => commit({})}
        >
          Tout réinitialiser
        </Button>
      </div>
    </div>
  );
}
