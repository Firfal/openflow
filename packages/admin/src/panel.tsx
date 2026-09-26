import { getOpenFlowFieldKind, type ImageValue, type VideoValue } from "@openflow/core";
import { AutoField, createUsePuck, type Fields, setDeep } from "@puckeditor/core";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useAdmin } from "./context.js";
import { ImageInput, VideoInput } from "./fields.js";
import { getDeep, resolveField, useFocus } from "./focus.js";
import { Icon } from "./icons.js";
import { StylePanel } from "./style-panel.js";
import { IconButton } from "./ui.js";

const usePuck = createUsePuck();

/**
 * The field the owner clicked on the page, shown first in the right panel. Changes go through
 * Puck's `replace` action, so they are undoable and autosaved like any other edit.
 */
function SelectedElement() {
  const { focus, setFocus } = useFocus();
  const selected = usePuck((s) => s.selectedItem);
  const config = usePuck((s) => s.config);
  const dispatch = usePuck((s) => s.dispatch);
  const getSelectorForId = usePuck((s) => s.getSelectorForId);

  const selectedId = selected?.props.id as string | undefined;
  // Another section gets selected (outline, keyboard…): the clicked element no longer applies.
  // Only on a selection change: a click sets the focus just before Puck selects its section.
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(() => {
    const current = focusRef.current;
    if (current && selectedId && current.componentId !== selectedId) setFocus(null);
  }, [selectedId, setFocus]);

  // Puck renders the fields panel twice (desktop and mobile): only the visible copy opens the
  // media library.
  const [shown, setShown] = useState(false);
  const measure = useCallback((node: HTMLElement | null) => {
    if (node) setShown(node.getClientRects().length > 0);
  }, []);

  if (!selected || !focus?.path || focus.componentId !== selectedId) return null;
  const component = config.components[selected.type];
  const resolved = resolveField(component?.fields as Fields | undefined, focus.path, focus.index);
  if (!resolved) return null;

  const value = getDeep(selected.props, resolved.path);
  const media = getOpenFlowFieldKind(resolved.field);
  const onChange = (next: unknown) => {
    const selector = getSelectorForId(selectedId);
    if (!selector) return;
    dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...selected, props: setDeep(selected.props, resolved.path, next) },
    });
  };

  return (
    <section ref={measure} className="of-selected" aria-label="Élément sélectionné">
      <header className="of-selected__header">
        <span className="of-selected__eyebrow">
          <Icon name="pointer" size={13} />
          Élément cliqué
        </span>
        <IconButton icon="x" label="Fermer" size="sm" onClick={() => setFocus(null)} />
      </header>
      <p className="of-selected__label">{resolved.label}</p>
      {media === "image" ? (
        // Keyed by the tap: tapping the image again reopens the media library.
        <ImageInput
          key={`${resolved.path}:${focus.open ?? 0}`}
          label=""
          value={value as ImageValue | null}
          onChange={onChange}
          openLibrary={Boolean(focus.open) && shown}
        />
      ) : media === "video" ? (
        <VideoInput
          key={`${resolved.path}:${focus.open ?? 0}`}
          label=""
          value={value as VideoValue | null}
          onChange={onChange}
          openLibrary={Boolean(focus.open) && shown}
        />
      ) : (
        <AutoField
          field={{ ...resolved.field, label: undefined } as never}
          id={`of-selected-${resolved.path}`}
          value={value}
          onChange={onChange}
        />
      )}
    </section>
  );
}

/**
 * Right panel (Puck `overrides.fields`). « Contenu »: the clicked element first, then all section
 * fields. « Style »: free style of the section or element (unless `editor.styles` is `off`).
 */
/** Nothing selected: how to start (Webflow shows the same kind of hint in its empty panels). */
function NothingSelected() {
  return (
    <div className="of-panel__empty">
      <span className="of-empty__icon">
        <Icon name="pointer" size={20} />
      </span>
      <strong>Cliquez sur un élément de la page</strong>
      <span>
        Un texte, une image ou une section : ses réglages s'affichent ici. Les textes s'écrivent
        aussi directement sur la page.
      </span>
    </div>
  );
}

export function FieldsPanel({ children }: { children: ReactNode }) {
  const { config } = useAdmin();
  const selected = usePuck((s) => s.selectedItem);
  const rootFields = usePuck((s) => Object.keys(s.config.root?.fields ?? {}).length > 0);
  const [tab, setTab] = useState<"content" | "style">("content");
  if (!selected || config.editor?.styles === "off") {
    return (
      <div className="of-panel">
        {!selected && <NothingSelected />}
        <SelectedElement />
        {(selected || rootFields) && children}
      </div>
    );
  }
  return (
    <div className="of-panel">
      <div className="of-panel__tabs" role="tablist" aria-label="Panneau">
        {(
          [
            ["content", "Contenu", "type"],
            ["style", "Style", "palette"],
          ] as const
        ).map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "is-active" : ""}
            onClick={() => setTab(value)}
          >
            <Icon name={icon} size={14} />
            {label}
          </button>
        ))}
      </div>
      {tab === "content" ? (
        <>
          <SelectedElement />
          {children}
        </>
      ) : (
        <StylePanel />
      )}
    </div>
  );
}
