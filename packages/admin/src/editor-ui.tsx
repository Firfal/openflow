import { ActionBar, createUsePuck, type Overrides } from "@puckeditor/core";
import { createContext, type ReactNode, useContext } from "react";
import type { SaveState } from "./autosave.js";
import { CanvasFrame, SettingsCanvasFrame } from "./canvas.js";
import { Button } from "./ui.js";

/**
 * Editor chrome shared with Puck overrides. Overrides are module constants (Puck rebuilds its
 * store and remounts the canvas whenever `overrides` changes identity), so the values that change
 * (save state) travel through this context instead of closures.
 */
export interface EditorChrome {
  saveState: SaveState;
  saveError?: string;
  retry: () => void;
  /** "Terminer" button (page editor only). */
  finish?: () => void;
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
    <span className={`of-save of-save--${state}`} role="status" title={error}>
      {state === "saving" && <span className="of-spinner of-spinner--small" aria-hidden />}
      {SAVE_LABELS[state]}
      {state === "error" && (
        <Button variant="ghost" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </span>
  );
}

function HeaderActions(_props: { children: ReactNode }) {
  const chrome = useContext(EditorChromeContext);
  return (
    <>
      {chrome && (
        <SaveIndicator state={chrome.saveState} error={chrome.saveError} onRetry={chrome.retry} />
      )}
      {chrome?.finish && (
        <Button variant="ghost" onClick={chrome.finish}>
          Terminer
        </Button>
      )}
    </>
  );
}

const usePuck = createUsePuck();

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

function DrawerWithHint({ children }: { children: ReactNode }) {
  return (
    <div className="of-drawer">
      <p className="of-drawer__hint">
        Cliquez sur une section pour l'ajouter sous la section sélectionnée, ou glissez-la à
        l'endroit voulu de la page. Pour changer l'ordre, utilisez « Structure » ou les flèches de
        la section.
      </p>
      {children}
    </div>
  );
}

function DrawerItemWithAdd({ children, name }: { children: ReactNode; name: string }) {
  const insert = useInsertSection();
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
        +
      </span>
      {children}
    </div>
  );
}

function Arrow({ up }: { up?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d={up ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M19 12l-7 7-7-7"} />
    </svg>
  );
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

/** Overrides of the page editor (stable identity: never recreate them in a render). */
export const PAGE_EDITOR_OVERRIDES: Partial<Overrides> = {
  headerActions: HeaderActions,
  actionBar: SectionActionBar,
  drawer: DrawerWithHint,
  drawerItem: DrawerItemWithAdd,
  iframe: CanvasFrame,
};

/** Overrides of the settings editor (no sections: header actions only). */
export const SETTINGS_EDITOR_OVERRIDES: Partial<Overrides> = {
  headerActions: HeaderActions,
  iframe: SettingsCanvasFrame,
};

export const EDITOR_IFRAME = { enabled: true, waitForStyles: true } as const;
