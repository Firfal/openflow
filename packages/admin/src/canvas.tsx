import { buildPageCss, buildThemeCss } from "@openflow/core";
import { createUsePuck, type Fields } from "@puckeditor/core";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAdmin } from "./context.js";
import { type Focus, resolveField, useFocus } from "./focus.js";

/** Elements handled by Puck itself (sections, drop zones, action bars): never intercepted. */
const PUCK_UI = "[data-puck-dropzone], [data-puck-overlay], [data-puck-overlay-portal]";

/**
 * Behaviour of the canvas document (Puck `overrides.iframe`), shared by the page and settings
 * editors:
 * - every `<details>` inside a section stays open, so collapsed content (FAQ answers…) is visible
 *   and editable in place;
 * - the site frame (header, footer) is inert: its links would navigate the preview, and its
 *   content is edited in Réglages.
 */
/** Styles injected in the canvas: clickable elements and the selected one. */
const CANVAS_CSS = `
[data-puck-component] [data-of]:hover { outline: 1px solid color-mix(in srgb, var(--of-accent, #2f5bff) 70%, transparent); outline-offset: 2px; }
`;

const attr = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** CSS outlining the focused element (re-applied by the browser after every re-render). */
function focusCss(focus: Focus | null): string {
  if (!focus?.path) return "";
  const index = focus.index ? `[data-of-i="${attr(focus.index)}"]` : ":not([data-of-i])";
  return `[data-of-s="${attr(focus.componentId)}"] [data-of="${attr(focus.path)}"]${index} {
  outline: 2px solid var(--of-accent, #2f5bff) !important; outline-offset: 3px; border-radius: 2px;
}`;
}

/** The marked element under a click (images have `pointer-events: none`: hit-tested). */
function markedAt(section: Element, target: Element, x: number, y: number): Element | null {
  const marked = target.closest("[data-of]");
  if (marked && section.contains(marked)) return marked;
  for (const img of section.querySelectorAll("img[data-of], video[data-of]")) {
    const r = img.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return img;
  }
  return null;
}

function useCanvasBehaviour(doc: Document | undefined, notice: boolean) {
  const { notify } = useAdmin();
  const { focus, setFocus } = useFocus();
  const lastNotice = useRef(0);
  // Styles for markers and the focused element.
  useEffect(() => {
    if (!doc?.head) return;
    const style = doc.createElement("style");
    style.setAttribute("data-openflow-canvas", "");
    style.textContent = CANVAS_CSS + focusCss(focus);
    doc.head.appendChild(style);
    return () => style.remove();
  }, [doc, focus]);

  // Clicks on a section: remember which element (field) the owner clicked. A tap (no drag) on
  // an image or a video also opens the media library to replace it.
  useEffect(() => {
    if (!doc?.body) return;
    let down: { x: number; y: number; t: number; focus: Focus } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      down = null;
      const target = event.target as Element | null;
      // Buttons of Puck's action bar (move, duplicate, delete) are not content. (Sections
      // themselves carry role="button", set by the drag-and-drop library.)
      if (!target?.closest || target.closest("[data-puck-overlay] button")) return;
      // Puck lays an overlay over hovered/selected sections: find the section under the pointer.
      const section =
        target.closest("[data-puck-component]") ??
        doc
          .elementsFromPoint(event.clientX, event.clientY)
          .find((el) => el.matches("[data-puck-component]"));
      if (!section) return;
      const componentId = section.getAttribute("data-puck-component") ?? "";
      const marked = markedAt(section, target, event.clientX, event.clientY);
      const focus: Focus = marked
        ? {
            componentId,
            path: marked.getAttribute("data-of") ?? undefined,
            index: marked.getAttribute("data-of-i") ?? undefined,
            kind:
              marked.tagName === "IMG" ? "image" : marked.tagName === "VIDEO" ? "video" : "text",
          }
        : { componentId };
      setFocus(focus);
      if (event.button === 0 && (focus.kind === "image" || focus.kind === "video"))
        down = { x: event.clientX, y: event.clientY, t: event.timeStamp, focus };
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = down;
      down = null;
      if (!start) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > 6 || event.timeStamp - start.t > 800) return;
      setFocus({ ...start.focus, open: Date.now() });
    };
    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("pointerup", onPointerUp, true);
    return () => {
      doc.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("pointerup", onPointerUp, true);
    };
  }, [doc, setFocus]);

  // ⌘S and ⌘K typed while editing a text: the iframe keeps its keyboard events.
  useEffect(() => {
    if (!doc) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "s" && key !== "k") return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent(key === "s" ? "openflow:save" : "openflow:palette"));
    };
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
  }, [doc]);

  useEffect(() => {
    if (!doc?.body) return;
    const openAll = () => {
      for (const details of doc.querySelectorAll<HTMLDetailsElement>(
        "[data-puck-component] details:not([open])",
      )) {
        details.open = true;
      }
    };
    openAll();
    const observer = new MutationObserver(openAll);
    observer.observe(doc.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest || target.closest(PUCK_UI)) return;
      // After a drag, the browser sends the click to a common ancestor of the page (body, main…):
      // only clicks on the frame itself (header, footer) are intercepted.
      const zone = doc.querySelector("[data-puck-dropzone]");
      if (zone && target.contains(zone)) return;
      event.preventDefault();
      event.stopPropagation();
      if (notice && Date.now() - lastNotice.current > 4000) {
        lastNotice.current = Date.now();
        notify(
          "info",
          "L'en-tête et le pied de page sont communs à toutes les pages : modifiez-les dans Réglages.",
        );
      }
    };
    doc.addEventListener("click", onClick, true);
    return () => {
      observer.disconnect();
      doc.removeEventListener("click", onClick, true);
    };
  }, [doc, notify, notice]);
}

type FrameProps = { children: ReactNode; document?: Document };

const usePuck = createUsePuck();

/** Free style of the page (`_style` of each section), rendered as on the published site. */
function PageStyles() {
  const data = usePuck((s) => s.appState.data);
  const css = useMemo(() => buildPageCss(data, { editing: true }), [data]);
  return css ? <style data-openflow-style="">{css}</style> : null;
}

export function CanvasFrame({ children, document }: FrameProps) {
  useCanvasBehaviour(document, true);
  return (
    <>
      <PageStyles />
      {children}
    </>
  );
}

/** Settings preview: the header and footer are what is being edited, so no notice. */
export function SettingsCanvasFrame({ children, document }: FrameProps) {
  useCanvasBehaviour(document, false);
  return <>{children}</>;
}

/** Theme tokens chosen by the owner (`:root` variables), as on the published site. */
export function ThemeStyles({ theme }: { theme: Record<string, string> | undefined }) {
  const css = buildThemeCss(theme);
  return css ? <style data-openflow-theme="">{css}</style> : null;
}

/** The site layout (header, footer, theme) around the page being edited. */
export function EditorFrame({ children }: { children: ReactNode }) {
  const { config, settings } = useAdmin();
  const Layout = config.layout;
  const values = { ...(config.settings?.defaultProps ?? {}), ...(settings?.values ?? {}) };
  const site = { ...config.site, ...(settings?.site ?? {}) };
  return (
    <>
      <ThemeStyles theme={settings?.theme} />
      {Layout ? (
        <Layout settings={values} site={site} editing>
          {children}
        </Layout>
      ) : (
        children
      )}
    </>
  );
}

interface Hint {
  left: number;
  top: number;
  video: boolean;
}

interface Badge {
  left: number;
  top: number;
  label: string;
}

/**
 * Box of a marked text as the owner sees it: while inline editing, Puck wraps the text in an
 * editable block whose lines are not those of the (inline) marker itself.
 */
function visibleRect(element: Element): DOMRect | undefined {
  const target = element.querySelector(":scope > [contenteditable]") ?? element;
  const rects = [...target.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * Section overlay (Puck `overrides.componentOverlay`):
 * - on hover or selection, a « Remplacer l'image » label over each image of the section (purely
 *   visual: the click goes through to the section, where the canvas controller selects the image
 *   under the pointer);
 * - on the selected section, the name of the clicked text above it (Webflow's element badge).
 * Measured again when the section resizes (screen change, edit).
 */
export function SectionOverlay({
  children,
  hover,
  isSelected,
  componentId,
}: {
  children: ReactNode;
  hover: boolean;
  isSelected: boolean;
  componentId: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hints, setHints] = useState<Hint[]>([]);
  const [badge, setBadge] = useState<Badge | null>(null);
  const { focus } = useFocus();
  const type = usePuck((s) => s.getItemById(componentId)?.type);
  const fields = usePuck((s) =>
    type ? (s.config.components[type]?.fields as Fields | undefined) : undefined,
  );
  const data = usePuck((s) => s.appState.data);
  const active = hover || isSelected;
  const focused =
    isSelected && focus?.componentId === componentId && focus.path && focus.kind === "text"
      ? focus
      : null;
  const label =
    focused?.path && fields ? resolveField(fields, focused.path, focused.index)?.label : undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `data` re-measures after an edit.
  useLayoutEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!active || !doc) {
      setHints([]);
      setBadge(null);
      return;
    }
    const section = doc.querySelector(`[data-puck-component="${attr(componentId)}"]`);
    if (!section) return;
    const measure = () => {
      const base = section.getBoundingClientRect();
      setHints(
        [...section.querySelectorAll("img[data-of], video[data-of]")]
          .map((media) => ({ r: media.getBoundingClientRect(), video: media.tagName === "VIDEO" }))
          .filter(({ r }) => r.width > 60 && r.height > 40)
          .map(({ r, video }) => ({
            left: r.left - base.left + 8,
            top: r.top - base.top + 8,
            video,
          })),
      );
      if (!focused?.path || !label) return setBadge(null);
      const index = focused.index ? `[data-of-i="${attr(focused.index)}"]` : ":not([data-of-i])";
      const element = section.querySelector(`[data-of="${attr(focused.path)}"]${index}`);
      const r = element ? visibleRect(element) : undefined;
      setBadge(
        r ? { left: Math.max(0, r.left - base.left - 5), top: r.top - base.top - 27, label } : null,
      );
    };
    measure();
    const view = doc.defaultView;
    if (!view?.ResizeObserver) return;
    const observer = new view.ResizeObserver(measure);
    observer.observe(section);
    return () => observer.disconnect();
  }, [active, componentId, focused?.path, focused?.index, label, data]);

  return (
    <>
      {children}
      <div ref={ref} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {hints.map((hint) => (
          <span
            key={`${hint.left}-${hint.top}`}
            style={{
              position: "absolute",
              left: hint.left,
              top: hint.top,
              padding: "4px 8px",
              borderRadius: 6,
              background: "rgb(24 24 27 / 0.82)",
              color: "#fff",
              font: "500 12px/1.2 var(--of-font, system-ui, sans-serif)",
              whiteSpace: "nowrap",
            }}
          >
            {hint.video ? "Cliquer pour remplacer la vidéo" : "Cliquer pour remplacer l'image"}
          </span>
        ))}
        {badge && (
          <span
            style={{
              position: "absolute",
              left: badge.left,
              top: Math.max(-20, badge.top),
              maxWidth: "calc(100% - 8px)",
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--of-accent, #2f5bff)",
              color: "#fff",
              font: "600 11px/1.35 var(--of-font, system-ui, sans-serif)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {badge.label}
          </span>
        )}
      </div>
    </>
  );
}
