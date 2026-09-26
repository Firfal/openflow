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
import { MediaLibrary } from "./media.js";
import {
  ColorControl,
  contrastRatio,
  LengthControl,
  NumberControl,
  RangeControl,
  SegmentedControl,
  SelectControl,
  StyleRow,
  type Swatch,
  toHex6,
} from "./style-controls.js";
import { Button } from "./ui.js";

const usePuck = createUsePuck();

/** Screens of the editor (Puck viewports): the style panel edits the one shown. */
export const SCREENS: Array<{ bp: Breakpoint; label: string; width: number }> = [
  { bp: "base", label: "Ordinateur", width: 1280 },
  { bp: "tablet", label: "Tablette", width: 768 },
  { bp: "mobile", label: "Mobile", width: 390 },
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="of-style-group" open>
      <summary>{title}</summary>
      <div className="of-style-group__body">{children}</div>
    </details>
  );
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
    return <p className="of-style-empty">Sélectionnez une section ou un élément de la page.</p>;
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

  const commit = (nextResponsive: ResponsiveStyle) => {
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
    });
  };
  const set = <K extends StyleProperty>(key: K, value: StyleValues[K] | undefined) => {
    const next: StyleValues = { ...values };
    if (value === undefined) delete next[key];
    else next[key] = value;
    commit({ ...responsive, [bp]: next });
  };
  const setMany = (patch: Partial<StyleValues>) => {
    const next: Record<string, unknown> = { ...values };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    commit({ ...responsive, [bp]: next as StyleValues });
  };

  const row = <K extends StyleProperty>(
    key: K,
    label: string,
    control: (id: string, value: StyleValues[K] | undefined) => ReactNode,
    hint?: ReactNode,
  ) => (
    <StyleRow
      key={key}
      label={label}
      set={values[key] !== undefined}
      onReset={() => set(key, undefined)}
      hint={hint}
    >
      {(id) => control(id, values[key])}
    </StyleRow>
  );
  const placeholder = (key: StyleProperty, current?: string) => {
    const value = inherited[key];
    return value !== undefined ? String(value) : current;
  };
  const length = (
    key: StyleProperty,
    label: string,
    options: { keywords?: string[]; units?: string[]; current?: string } = {},
  ) =>
    row(key, label, (id, value) => (
      <LengthControl
        id={id}
        value={value as string | undefined}
        placeholder={placeholder(key, options.current)}
        keywords={options.keywords}
        units={options.units}
        onChange={(v) => set(key, v as never)}
      />
    ));

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

      <fieldset className="of-segmented of-style__screens">
        <legend className="of-sr-only">Écran</legend>
        {SCREENS.map((s) => (
          <button
            key={s.bp}
            type="button"
            aria-pressed={s.bp === bp}
            className={s.bp === bp ? "is-active" : ""}
            onClick={() => setScreen(s)}
          >
            {s.label}
          </button>
        ))}
      </fieldset>
      <p className="of-style__note">
        {bp === "base"
          ? "Réglages pour tous les écrans : la tablette et le mobile peuvent les modifier."
          : `Réglages propres à l'écran ${screen.label.toLowerCase()} (les autres écrans ne changent pas).`}
        {isList && " Ce style s'applique à tous les éléments de la liste."}
      </p>

      {text && (
        <Group title="Typographie">
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
          {row("lineHeight", "Interligne", (id, value) => (
            <NumberControl
              id={id}
              value={value}
              min={0.5}
              max={4}
              step={0.05}
              placeholder={placeholder("lineHeight", "ex. 1,4")}
              onChange={(v) => set("lineHeight", v)}
            />
          ))}
          {length("letterSpacing", "Espacement des lettres", { units: ["em", "px"] })}
          {row("textAlign", "Alignement", (_id, value) => (
            <SegmentedControl
              label="Alignement"
              value={value}
              options={[
                ["left", "Gauche"],
                ["center", "Centre"],
                ["right", "Droite"],
                ["justify", "Justifié"],
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

      <Group title={target === "section" ? "Couleurs et fond" : "Couleurs"}>
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
                  <Button id={id} onClick={() => setLibrary(true)}>
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

      <Group title="Espacements">
        {target === "section" ? (
          <>
            {length("paddingTop", "Marge intérieure en haut")}
            {length("paddingBottom", "Marge intérieure en bas")}
            {length("paddingLeft", "Marge intérieure à gauche")}
            {length("paddingRight", "Marge intérieure à droite")}
          </>
        ) : (
          <>
            {length("marginTop", "Espace au-dessus", { keywords: ["auto"] })}
            {length("marginBottom", "Espace au-dessous", { keywords: ["auto"] })}
            {target === "text" && (
              <>
                {length("paddingTop", "Marge intérieure en haut")}
                {length("paddingBottom", "Marge intérieure en bas")}
                {length("paddingLeft", "Marge intérieure à gauche")}
                {length("paddingRight", "Marge intérieure à droite")}
              </>
            )}
          </>
        )}
      </Group>

      <Group title="Dimensions">
        {length("maxWidth", "Largeur maximale", { keywords: ["none"], units: ["px", "%", "rem"] })}
        {target === "section" &&
          length("minHeight", "Hauteur minimale", { units: ["px", "vh", "rem"] })}
      </Group>

      <Group title="Bordure et effets">
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

      <Group title="Visibilité">
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
          disabled={Object.keys(values).length === 0}
          onClick={() => commit({ ...responsive, [bp]: {} })}
        >
          Réinitialiser cet écran
        </Button>
        <Button
          variant="ghost"
          disabled={Object.keys(responsive).length === 0}
          onClick={() => commit({})}
        >
          Tout réinitialiser
        </Button>
      </div>
    </div>
  );
}
