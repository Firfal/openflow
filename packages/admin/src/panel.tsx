import { getOpenFlowFieldKind, type ImageValue, type VideoValue } from "@openflow/core";
import { AutoField, createUsePuck, type Fields, setDeep } from "@puckeditor/core";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ImageInput, VideoInput } from "./fields.js";
import { getDeep, resolveField, useFocus } from "./focus.js";
import { Button } from "./ui.js";

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
        <span className="of-selected__eyebrow">Élément sélectionné</span>
        <Button variant="ghost" onClick={() => setFocus(null)}>
          Fermer
        </Button>
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

/** Right panel (Puck `overrides.fields`): the clicked element first, then all section fields. */
export function FieldsPanel({ children }: { children: ReactNode }) {
  return (
    <div className="of-panel">
      <SelectedElement />
      {children}
    </div>
  );
}
