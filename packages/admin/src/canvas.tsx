import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAdmin } from "./context.js";
import { type Focus, useFocus } from "./focus.js";

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
[data-puck-component] [data-of]:hover { outline: 1px dashed rgb(59 91 219 / 0.7); outline-offset: 2px; }
`;

const attr = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** CSS outlining the focused element (re-applied by the browser after every re-render). */
function focusCss(focus: Focus | null): string {
  if (!focus?.path) return "";
  const index = focus.index ? `[data-of-i="${attr(focus.index)}"]` : ":not([data-of-i])";
  return `[data-of-s="${attr(focus.componentId)}"] [data-of="${attr(focus.path)}"]${index} {
  outline: 2px solid #3b5bdb !important; outline-offset: 3px; border-radius: 2px;
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

export function CanvasFrame({ children, document }: FrameProps) {
  useCanvasBehaviour(document, true);
  return <>{children}</>;
}

/** Settings preview: the header and footer are what is being edited, so no notice. */
export function SettingsCanvasFrame({ children, document }: FrameProps) {
  useCanvasBehaviour(document, false);
  return <>{children}</>;
}

/** The site layout (header, footer, theme) around the page being edited. */
export function EditorFrame({ children }: { children: ReactNode }) {
  const { config, settings } = useAdmin();
  const Layout = config.layout;
  if (!Layout) return <>{children}</>;
  const values = { ...(config.settings?.defaultProps ?? {}), ...(settings?.values ?? {}) };
  const site = { ...config.site, ...(settings?.site ?? {}) };
  return (
    <Layout settings={values} site={site} editing>
      {children}
    </Layout>
  );
}

interface Hint {
  left: number;
  top: number;
  video: boolean;
}

/**
 * Section overlay (Puck `overrides.componentOverlay`): on hover or selection, a « Remplacer
 * l'image » label over each image of the section. The label is purely visual: the click goes
 * through to the section, where the canvas controller selects the image under the pointer.
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
  const active = hover || isSelected;

  useLayoutEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!active || !doc) {
      setHints([]);
      return;
    }
    const section = doc.querySelector(`[data-puck-component="${attr(componentId)}"]`);
    if (!section) return;
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
  }, [active, componentId]);

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
              background: "rgb(15 20 30 / 0.78)",
              color: "#fff",
              font: "600 12px/1.2 system-ui, sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {hint.video ? "Cliquer pour remplacer la vidéo" : "Cliquer pour remplacer l'image"}
          </span>
        ))}
      </div>
    </>
  );
}
