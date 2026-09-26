import { slugToPath } from "@openflow/core";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { flushAllAutosaves } from "./autosave.js";
import { useAdmin } from "./context.js";
import { Icon, type IconName } from "./icons.js";
import { MOD_KEY } from "./ui.js";
import { useUiTheme } from "./ui-theme.js";

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: IconName;
  keywords?: string;
  run: () => void;
}

/** Normalised text for matching (case and accents ignored). */
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Asks the publish button to open its dialog (the palette has no publish logic of its own). */
export function requestPublish() {
  window.dispatchEvent(new CustomEvent("openflow:publish"));
}

/** Asks the pages view to open the « Nouvelle page » dialog. */
export function requestNewPage() {
  window.dispatchEvent(new CustomEvent("openflow:new-page"));
}

/**
 * Quick find (⌘K / Ctrl+K), as in Webflow and Framer: jump to a page, a setting, or run an action
 * with the keyboard.
 */
export function CommandPalette() {
  const { pages, navigate, config } = useAdmin();
  const [, setTheme] = useUiTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const listId = useId();

  useEffect(() => {
    const show = () => {
      setQuery("");
      setActive(0);
      setOpen(true);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("openflow:palette", show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("openflow:palette", show);
    };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (run: () => void) => async () => {
      await flushAllAutosaves();
      run();
    };
    const list: Command[] = pages.map((page) => ({
      id: `page:${page.id}`,
      group: "Pages",
      label: page.title,
      hint: slugToPath(page.slug),
      icon: page.slug === "" ? "home" : "fileText",
      keywords: "modifier page",
      run: go(() => navigate({ view: "editor", pageId: page.id })),
    }));
    list.push(
      {
        id: "new-page",
        group: "Actions",
        label: "Nouvelle page",
        icon: "plus",
        keywords: "créer ajouter",
        run: go(() => {
          navigate({ view: "pages" });
          setTimeout(requestNewPage, 0);
        }),
      },
      {
        id: "publish",
        group: "Actions",
        label: "Publier le site",
        icon: "globe",
        keywords: "mettre en ligne",
        run: requestPublish,
      },
      {
        id: "site",
        group: "Actions",
        label: "Voir le site",
        icon: "externalLink",
        run: () => window.open("/", "_blank", "noopener"),
      },
      {
        id: "go:pages",
        group: "Aller à",
        label: "Toutes les pages",
        icon: "fileText",
        run: go(() => navigate({ view: "pages" })),
      },
      {
        id: "go:media",
        group: "Aller à",
        label: "Médias",
        icon: "image",
        keywords: "images vidéos médiathèque",
        run: go(() => navigate({ view: "media" })),
      },
      {
        id: "go:global",
        group: "Aller à",
        label: "Réglages : contenu commun",
        icon: "panelTop",
        keywords: "menu pied de page en-tête",
        run: go(() => navigate({ view: "settings", tab: "global" })),
      },
      ...(config.theme
        ? [
            {
              id: "go:theme",
              group: "Aller à",
              label: "Réglages : thème",
              icon: "palette" as const,
              keywords: "couleurs polices",
              run: go(() => navigate({ view: "settings", tab: "theme" })),
            },
          ]
        : []),
      {
        id: "go:site",
        group: "Aller à",
        label: "Réglages : site et référencement",
        icon: "globe",
        keywords: "nom seo google langue",
        run: go(() => navigate({ view: "settings", tab: "site" })),
      },
      {
        id: "go:assistant",
        group: "Aller à",
        label: "Réglages : assistant IA",
        icon: "sparkles",
        keywords: "mcp claude chatgpt clé",
        run: go(() => navigate({ view: "settings", tab: "assistant" })),
      },
      {
        id: "go:history",
        group: "Aller à",
        label: "Historique des publications",
        icon: "history",
        keywords: "versions restaurer",
        run: go(() => navigate({ view: "history" })),
      },
      {
        id: "theme:light",
        group: "Apparence",
        label: "Apparence claire",
        icon: "sun",
        keywords: "thème clair",
        run: () => setTheme("light"),
      },
      {
        id: "theme:dark",
        group: "Apparence",
        label: "Apparence sombre",
        icon: "moon",
        keywords: "thème sombre nuit",
        run: () => setTheme("dark"),
      },
      {
        id: "theme:system",
        group: "Apparence",
        label: "Apparence du système",
        icon: "monitor",
        keywords: "thème automatique",
        run: () => setTheme("system"),
      },
    );
    return list;
  }, [pages, navigate, config.theme, setTheme]);

  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return commands;
    return commands.filter((command) => {
      const text = fold(`${command.label} ${command.hint ?? ""} ${command.keywords ?? ""}`);
      return words.every((word) => text.includes(word));
    });
  }, [commands, query]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    setOpen(false);
    command.run();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + delta + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[active]);
    }
  };

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  let group = "";
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the backdrop closes; Escape is native to <dialog>.
    <dialog
      ref={dialog}
      className="of-palette"
      aria-label="Recherche rapide"
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onClick={(event) => {
        if (event.target === dialog.current) setOpen(false);
      }}
    >
      {open && (
        <>
          <div className="of-palette__search">
            <Icon name="search" />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
              aria-label="Rechercher une page, un réglage ou une action"
              placeholder="Rechercher une page, un réglage, une action…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <div className="of-palette__list" id={listId} role="listbox" aria-label="Résultats">
            {results.length === 0 && <p className="of-palette__empty">Aucun résultat.</p>}
            {results.map((command, index) => {
              const heading = command.group !== group;
              group = command.group;
              return (
                <div key={command.id}>
                  {heading && (
                    <div className="of-palette__group" aria-hidden>
                      {command.group}
                    </div>
                  )}
                  <div
                    id={`${listId}-${index}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === active}
                    className="of-palette__item"
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(command)}
                    onKeyDown={() => undefined}
                  >
                    <Icon name={command.icon} />
                    <span>{command.label}</span>
                    {command.hint && <small>{command.hint}</small>}
                  </div>
                </div>
              );
            })}
          </div>
          <footer className="of-palette__footer" aria-hidden>
            <span>
              <kbd className="of-kbd">↑</kbd>
              <kbd className="of-kbd">↓</kbd> naviguer
            </span>
            <span>
              <kbd className="of-kbd">↵</kbd> ouvrir
            </span>
            <span>
              <kbd className="of-kbd">Échap</kbd> fermer
            </span>
            <span style={{ marginLeft: "auto" }}>
              <kbd className="of-kbd">{MOD_KEY}</kbd>
              <kbd className="of-kbd">K</kbd>
            </span>
          </footer>
        </>
      )}
    </dialog>
  );
}
