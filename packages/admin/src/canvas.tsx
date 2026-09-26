import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useAdmin } from "./context.js";

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
function useCanvasBehaviour(doc: Document | undefined, notice: boolean) {
  const { notify } = useAdmin();
  const lastNotice = useRef(0);

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
