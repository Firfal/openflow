import { slugToPath } from "@openflow/core";
import {
  ActionBar,
  blocksPlugin,
  createUsePuck,
  type Overrides,
  outlinePlugin,
  type Plugin,
  type UiState,
  useGetPuck,
  type Viewports,
} from "@puckeditor/core";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { type EditorBridge, getEditorBridge, setEditorBridge } from "./agent.js";
import type { SaveState } from "./autosave.js";
import { CanvasFrame, SectionOverlay, SettingsCanvasFrame } from "./canvas.js";
import { useAdmin } from "./context.js";
import { Icon, type IconName } from "./icons.js";
import { FieldsPanel } from "./panel.js";
import { PublishControl } from "./publish.js";
import { openCommandPalette, SiteMark } from "./shell.js";
import { Button, IconButton, Menu, MOD_KEY } from "./ui.js";

/**
 * Editor chrome shared with Puck overrides. Overrides are module constants (Puck rebuilds its
 * store and remounts the canvas whenever `overrides` changes identity), so the values that change
 * (save state) travel through this context instead of closures.
 */
export interface EditorChrome {
  /** Page editor, or one of the settings editors (theme, common content). */
  kind: "page" | "settings";
  /** Title shown in the bar (settings editors). */
  title?: string;
  saveState: SaveState;
  saveError?: string;
  retry: () => void;
  /** Saves pending changes, then opens another page or leaves the editor (page editor only). */
  open?: (pageId: string | null) => void;
  /** Page being edited (page editor only): AI assistants edit it through Puck. */
  pageId?: string;
}

export const EditorChromeContext = createContext<EditorChrome | null>(null);

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Enregistré",
  pending: "Modifications en cours…",
  saving: "Enregistrement…",
  error: "Échec de l'enregistrement",
};

export function SaveIndicator({
  state,
  error,
  onRetry,
}: {
  state: SaveState;
  error?: string;
  onRetry: () => void;
}) {
  return (
    <span
      className={`of-save of-save--${state}`}
      role="status"
      title={error ?? "Vos modifications sont enregistrées automatiquement (brouillon)."}
    >
      {state === "saving" && <span className="of-spinner of-spinner--small" aria-hidden />}
      <span className="of-save__label">{SAVE_LABELS[state]}</span>
      {state === "error" && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </span>
  );
}

/**
 * Lets an AI assistant (WebMCP, or the MCP server through live sync) edit the open page through
 * Puck: the owner sees each change, can undo it, and autosave stays the only writer.
 */
function AgentBridge({ pageId }: { pageId: string }) {
  const getPuck = useGetPuck();
  useEffect(() => {
    const bridge: EditorBridge = {
      pageId,
      getData: () => getPuck().appState.data,
      setData: (data) => getPuck().dispatch({ type: "setData", data }),
    };
    setEditorBridge(bridge);
    return () => {
      if (getEditorBridge() === bridge) setEditorBridge(null);
    };
  }, [pageId, getPuck]);
  return null;
}

const usePuck = createUsePuck();

/**
 * Screens of the editor, matching the breakpoints of the free style (tablet ≤ 1023 px,
 * mobile ≤ 767 px). No « full width » option: the canvas always shows a real screen size.
 */
export const EDITOR_VIEWPORTS: Viewports = [
  { width: 1280, height: "auto", label: "Ordinateur", icon: "Monitor" },
  { width: 768, height: "auto", label: "Tablette", icon: "Tablet" },
  { width: 390, height: "auto", label: "Mobile", icon: "Smartphone" },
];

const SCREENS: Array<{ width: number; label: string; icon: IconName }> = [
  { width: 1280, label: "Ordinateur", icon: "monitor" },
  { width: 768, label: "Tablette", icon: "tablet" },
  { width: 390, label: "Mobile", icon: "smartphone" },
];

/** Initial UI of the editors: the screens live in the editor bar, not above the canvas. */
export function editorUi(extra: Partial<UiState> = {}): Partial<UiState> {
  const phone = typeof window !== "undefined" && window.innerWidth < 640;
  return {
    viewports: {
      current: { width: phone ? 390 : 1280, height: "auto" },
      controlsVisible: false,
      options: [],
    },
    ...extra,
  };
}

/** Screen switcher (Ordinateur / Tablette / Mobile), as Webflow's breakpoint icons. */
function Screens() {
  const dispatch = usePuck((s) => s.dispatch);
  const viewports = usePuck((s) => s.appState.ui.viewports);
  const current = viewports.current.width;
  return (
    <fieldset className="of-breakpoints">
      <legend className="of-sr-only">Écran</legend>
      {SCREENS.map((screen) => (
        <button
          key={screen.width}
          type="button"
          aria-pressed={current === screen.width}
          title={`${screen.label} (${screen.width} px)`}
          onClick={() =>
            dispatch({
              type: "setUi",
              ui: { viewports: { ...viewports, current: { width: screen.width, height: "auto" } } },
            })
          }
        >
          <Icon name={screen.icon} />
          <span className="of-breakpoints__label">{screen.label}</span>
          {current === screen.width && (
            <span className="of-breakpoints__width">{screen.width}</span>
          )}
        </button>
      ))}
    </fieldset>
  );
}

function UndoRedo() {
  const history = usePuck((s) => s.history);
  return (
    <>
      <IconButton
        icon="undo"
        label={`Annuler (${MOD_KEY} Z)`}
        disabled={!history.hasPast}
        onClick={history.back}
      />
      <IconButton
        icon="redo"
        label={`Rétablir (${MOD_KEY} ⇧ Z)`}
        disabled={!history.hasFuture}
        onClick={history.forward}
      />
    </>
  );
}

/** Current page, with a menu to open another one (Webflow's page selector). */
function PageSwitcher({ chrome }: { chrome: EditorChrome }) {
  const { pages } = useAdmin();
  const page = pages.find((p) => p.id === chrome.pageId);
  if (!page) return null;
  return (
    <Menu
      label="Pages"
      align="left"
      items={[
        { heading: "Ouvrir une page" },
        ...pages.map((p) => ({
          label: p.title,
          hint: slugToPath(p.slug),
          icon: (p.slug === "" ? "home" : "fileText") as IconName,
          checked: p.id === page.id,
          onSelect: () => chrome.open?.(p.id),
        })),
      ]}
      trigger={(props) => (
        <button
          type="button"
          className="of-switcher"
          aria-label={`Page : ${page.title}`}
          {...props}
        >
          <span className="of-switcher__title">{page.title}</span>
          <span className="of-switcher__path">{slugToPath(page.slug)}</span>
          <Icon name="chevronDown" size={14} />
        </button>
      )}
    />
  );
}

/**
 * The only bar of the editors (Puck `overrides.header`): back to the dashboard and page switcher,
 * screens, undo/redo, save state and « Publier ».
 */
function EditorBar(_props: { actions: ReactNode; children: ReactNode }) {
  const chrome = useContext(EditorChromeContext);
  const { settings, config } = useAdmin();
  const siteName = settings?.site?.name ?? config.site.name;

  // ⌘S / Ctrl+S: save now (a reflex; autosave already runs).
  // (`openflow:save` comes from the canvas, whose keyboard events stay in its iframe.)
  useEffect(() => {
    const save = () => chrome?.retry();
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("openflow:save", save);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("openflow:save", save);
    };
  }, [chrome]);

  if (!chrome) return <header className="of-ebar" />;
  return (
    <header className="of-ebar">
      {chrome.pageId && <AgentBridge pageId={chrome.pageId} />}
      <div className="of-ebar__start">
        {chrome.kind === "page" ? (
          <>
            <button
              type="button"
              className="of-home"
              onClick={() => chrome.open?.(null)}
              aria-label="Retour aux pages"
              title="Retour aux pages"
            >
              <Icon name="arrowLeft" />
              <SiteMark name={siteName} />
            </button>
            <span className="of-ebar__sep" aria-hidden />
            <PageSwitcher chrome={chrome} />
          </>
        ) : (
          <span className="of-ebar__title">
            <span>{chrome.title}</span>
            <small className="of-ebar__hide-sm">Appliqué à toutes les pages</small>
          </span>
        )}
      </div>
      <Screens />
      <div className="of-ebar__end">
        <SaveIndicator state={chrome.saveState} error={chrome.saveError} onRetry={chrome.retry} />
        <span className="of-ebar__sep" aria-hidden />
        <UndoRedo />
        <IconButton
          icon="search"
          label={`Rechercher (${MOD_KEY} K)`}
          className="of-ebar__hide-sm"
          onClick={openCommandPalette}
        />
        <PublishControl compact />
      </div>
    </header>
  );
}

/** Root zone of the page (OpenFlow pages have no nested slots). */
const ROOT_ZONE = "root:default-zone";

/** Inserts a section after the selected one (or at the end) and selects it. */
function useInsertSection() {
  const dispatch = usePuck((s) => s.dispatch);
  const selected = usePuck((s) => s.selectedItem);
  const getSelectorForId = usePuck((s) => s.getSelectorForId);
  const count = usePuck((s) => s.appState.data.content.length);
  const resolveDataById = usePuck((s) => s.resolveDataById);
  return (componentType: string) => {
    const selector = selected ? getSelectorForId(selected.props.id) : undefined;
    const index = selector?.zone === ROOT_ZONE ? selector.index + 1 : count;
    const id = `${componentType}-${crypto.randomUUID()}`;
    dispatch({
      type: "insert",
      componentType,
      destinationIndex: index,
      destinationZone: ROOT_ZONE,
      id,
    });
    dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
    resolveDataById(id, "insert");
  };
}

/** Search text of the section library, read by each item. */
const DrawerQuery = createContext("");

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function DrawerWithSearch({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  return (
    <div className={`of-drawer${query.trim() ? " is-searching" : ""}`}>
      <div className="of-search">
        <Icon name="search" size={14} className="of-search__icon" />
        <input
          className="of-input"
          type="search"
          aria-label="Rechercher une section"
          placeholder="Rechercher une section…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="of-drawer__hint">
        Cliquez pour ajouter sous la section sélectionnée, ou glissez à l'endroit voulu de la page.
      </p>
      <DrawerQuery.Provider value={fold(query.trim())}>{children}</DrawerQuery.Provider>
    </div>
  );
}

function DrawerItemWithAdd({ children, name }: { children: ReactNode; name: string }) {
  const insert = useInsertSection();
  const query = useContext(DrawerQuery);
  const label = usePuck((s) => s.config.components[name]?.label ?? name);
  if (query && !fold(`${label} ${name}`).includes(query)) return <span hidden />;
  return (
    // biome-ignore lint/a11y/useSemanticElements: the drawer item is Puck's draggable element; a nested <button> would steal the drag.
    <div
      className="of-drawer-item"
      role="button"
      tabIndex={0}
      title="Cliquer pour ajouter, ou glisser sur la page"
      onClick={() => insert(name)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          insert(name);
        }
      }}
    >
      <span className="of-drawer-item__plus" aria-hidden>
        <Icon name="plus" size={14} />
      </span>
      {children}
    </div>
  );
}

function Arrow({ up }: { up?: boolean }) {
  return <Icon name={up ? "arrowUp" : "arrowDown"} />;
}

/** Puck's action bar plus "move up / move down": reordering on the canvas without dragging. */
function SectionActionBar({
  label,
  children,
  parentAction,
}: {
  label?: string;
  children: ReactNode;
  parentAction: ReactNode;
}) {
  const dispatch = usePuck((s) => s.dispatch);
  const selected = usePuck((s) => s.selectedItem);
  const getSelectorForId = usePuck((s) => s.getSelectorForId);
  const getItemBySelector = usePuck((s) => s.getItemBySelector);
  const selector = selected ? getSelectorForId(selected.props.id) : undefined;
  const move = (delta: -1 | 1) => {
    if (!selector) return;
    const destinationIndex = selector.index + delta;
    dispatch({
      type: "move",
      sourceIndex: selector.index,
      sourceZone: selector.zone,
      destinationIndex,
      destinationZone: selector.zone,
    });
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index: destinationIndex, zone: selector.zone } },
    });
  };
  const canUp = Boolean(selector && selector.index > 0);
  const canDown = Boolean(
    selector && getItemBySelector({ index: selector.index + 1, zone: selector.zone }),
  );
  return (
    <ActionBar>
      <ActionBar.Group>
        {parentAction}
        {label && <ActionBar.Label label={label} />}
      </ActionBar.Group>
      {selector && (
        <ActionBar.Group>
          <ActionBar.Action label="Monter" disabled={!canUp} onClick={() => move(-1)}>
            <Arrow up />
          </ActionBar.Action>
          <ActionBar.Action label="Descendre" disabled={!canDown} onClick={() => move(1)}>
            <Arrow />
          </ActionBar.Action>
        </ActionBar.Group>
      )}
      <ActionBar.Group>{children}</ActionBar.Group>
    </ActionBar>
  );
}

/** « Pages » panel of the rail: open another page without leaving the editor. */
function PagesPanel() {
  const chrome = useContext(EditorChromeContext);
  const { pages } = useAdmin();
  const sorted = useMemo(
    () =>
      [...pages].sort((a, b) =>
        a.slug === "" ? -1 : b.slug === "" ? 1 : a.title.localeCompare(b.title, "fr"),
      ),
    [pages],
  );
  return (
    <div className="of-rail">
      <div className="of-rail__head">
        <span className="of-rail__title">Pages du site</span>
      </div>
      <ul className="of-pagelist">
        {sorted.map((page) => (
          <li key={page.id}>
            <button
              type="button"
              className="of-pagelist__item"
              aria-current={page.id === chrome?.pageId ? "page" : undefined}
              onClick={() => page.id !== chrome?.pageId && chrome?.open?.(page.id)}
            >
              <Icon name={page.slug === "" ? "home" : "fileText"} />
              <span className="of-pagelist__text">
                <strong>{page.title}</strong>
                <small>{slugToPath(page.slug)}</small>
              </span>
              {page.status !== "published" && (
                <span title="Masquée">
                  <Icon name="eyeOff" size={14} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" icon="plus" onClick={() => chrome?.open?.(null)}>
        Gérer les pages
      </Button>
    </div>
  );
}

const TIPS: Array<{ icon: IconName; text: string }> = [
  { icon: "pointer", text: "Cliquez sur un texte de la page pour l'écrire directement." },
  { icon: "image", text: "Cliquez sur une image pour la remplacer." },
  { icon: "palette", text: "Onglet « Style » à droite : couleurs, tailles, espacements." },
  { icon: "smartphone", text: "Changez d'écran en haut pour régler la tablette ou le mobile." },
  { icon: "globe", text: "Tout est enregistré en brouillon : « Publier » met le site en ligne." },
];

const SHORTCUTS: Array<[string, string]> = [
  [`${MOD_KEY} Z`, "Annuler"],
  [`${MOD_KEY} ⇧ Z`, "Rétablir"],
  [`${MOD_KEY} S`, "Enregistrer maintenant"],
  [`${MOD_KEY} K`, "Rechercher une page, un réglage"],
  ["Suppr", "Supprimer la section sélectionnée"],
];

/** « Aide » panel of the rail: how the editor works, and the keyboard shortcuts. */
function HelpPanel() {
  return (
    <div className="of-rail">
      <span className="of-rail__title">Comment ça marche</span>
      <ul className="of-tips">
        {TIPS.map((tip) => (
          <li key={tip.text}>
            <Icon name={tip.icon} className="of-icon--first-line" />
            <span>{tip.text}</span>
          </li>
        ))}
      </ul>
      <span className="of-rail__title">Raccourcis clavier</span>
      <dl className="of-shortcuts">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={keys}>
            <dt>{label}</dt>
            <dd>
              {keys.split(" ").map((key) => (
                <kbd key={key} className="of-kbd">
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Left rail of the page editor (Webflow: Add, Navigator, Pages…). Stable module constant. */
export const PAGE_EDITOR_PLUGINS: Plugin[] = [
  blocksPlugin({ label: "Ajouter", icon: <Icon name="plusSquare" size={20} /> }),
  outlinePlugin({ label: "Structure", icon: <Icon name="layers" size={20} /> }),
  { name: "pages", label: "Pages", icon: <Icon name="fileText" size={20} />, render: PagesPanel },
  { name: "help", label: "Aide", icon: <Icon name="help" size={20} />, render: HelpPanel },
];

/** Overrides of the page editor (stable identity: never recreate them in a render). */
export const PAGE_EDITOR_OVERRIDES: Partial<Overrides> = {
  header: EditorBar,
  actionBar: SectionActionBar,
  drawer: DrawerWithSearch,
  drawerItem: DrawerItemWithAdd,
  iframe: CanvasFrame,
  fields: FieldsPanel,
  componentOverlay: SectionOverlay,
};

/** Overrides of the settings editors (no sections: the bar and the preview only). */
export const SETTINGS_EDITOR_OVERRIDES: Partial<Overrides> = {
  header: EditorBar,
  iframe: SettingsCanvasFrame,
};

export const EDITOR_IFRAME = { enabled: true, waitForStyles: true } as const;
