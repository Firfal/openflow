import {
  getOpenFlowFieldKind,
  type ImageValue,
  type LinkValue,
  type VideoValue,
} from "@openflow/core";
import { AutoField, createUsePuck, type Fields, setDeep } from "@puckeditor/core";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { useAdmin } from "./context.js";
import { ImageInput, LinkInput, VideoInput } from "./fields.js";
import {
  type Focus,
  type FocusGroup,
  getDeep,
  type ResolvedField,
  resolveGroup,
  useFocus,
} from "./focus.js";
import { Icon, type IconName } from "./icons.js";
import { StylePanel } from "./style-panel.js";
import { IconButton } from "./ui.js";

const usePuck = createUsePuck();

const GROUP_ICONS: Record<FocusGroup["kind"], IconName> = {
  text: "type",
  image: "image",
  video: "video",
  link: "link",
  button: "pointer",
  item: "layers",
};

/** One field of the clicked element, with the admin's inputs for images, videos and links. */
function ElementField({
  resolved,
  label,
  value,
  onChange,
  openLibrary,
  focusKey,
}: {
  resolved: ResolvedField;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  openLibrary: boolean;
  focusKey: string;
}) {
  const id = useId();
  const kind = getOpenFlowFieldKind(resolved.field);
  if (kind === "image") {
    // Keyed by the tap: tapping the image again reopens the media library.
    return (
      <ImageInput
        key={focusKey}
        label={label}
        value={value as ImageValue | null}
        onChange={onChange}
        openLibrary={openLibrary}
      />
    );
  }
  if (kind === "video") {
    return (
      <VideoInput
        key={focusKey}
        label={label}
        value={value as VideoValue | null}
        onChange={onChange}
        openLibrary={openLibrary}
      />
    );
  }
  if (kind === "link") {
    return <LinkInput label={label} value={value as LinkValue | null} onChange={onChange} />;
  }
  return (
    <div className="of-efield">
      {label && (
        <label className="of-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <AutoField
        field={{ ...resolved.field, label: undefined } as never}
        id={id}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

/**
 * The element the owner clicked on the page, with only its fields: a button (text and link), a
 * list item (all its fields), or a single text, image or video. Changes go through Puck's
 * `replace` action, so they are undoable and autosaved like any other edit.
 */
function ElementPanel({ group, focus }: { group: FocusGroup; focus: Focus }) {
  const { setFocus } = useFocus();
  const selected = usePuck((s) => s.selectedItem);
  const dispatch = usePuck((s) => s.dispatch);
  const getSelectorForId = usePuck((s) => s.getSelectorForId);
  const sectionLabel = usePuck((s) =>
    selected ? (s.config.components[selected.type]?.label ?? selected.type) : "",
  );

  // Puck renders the fields panel twice (desktop and mobile): only the visible copy opens the
  // media library.
  const [shown, setShown] = useState(false);
  const measure = useCallback((node: HTMLElement | null) => {
    if (node) setShown(node.getClientRects().length > 0);
  }, []);

  if (!selected) return null;
  const change = (path: string) => (next: unknown) => {
    const selector = getSelectorForId(selected.props.id as string);
    if (!selector) return;
    dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...selected, props: setDeep(selected.props, path, next) },
    });
  };

  return (
    <section ref={measure} className="of-selected" aria-label="Élément sélectionné">
      <header className="of-selected__header">
        <span className="of-selected__icon" aria-hidden>
          <Icon name={GROUP_ICONS[group.kind]} size={14} />
        </span>
        <span className="of-selected__titles">
          <span className="of-selected__label">{group.title}</span>
          <span className="of-selected__context">dans {sectionLabel}</span>
        </span>
        <IconButton
          icon="x"
          label="Afficher toute la section"
          size="sm"
          onClick={() => setFocus({ componentId: focus.componentId })}
        />
      </header>
      <div className="of-selected__fields">
        {group.fields.map((resolved, n) => (
          <ElementField
            key={resolved.path}
            resolved={resolved}
            label={resolved.short}
            value={getDeep(selected.props, resolved.path)}
            onChange={change(resolved.path)}
            openLibrary={n === 0 && Boolean(focus.open) && shown}
            focusKey={`${resolved.path}:${n === 0 ? (focus.open ?? 0) : 0}`}
          />
        ))}
      </div>
    </section>
  );
}

/** Nothing selected: how to start (Webflow shows the same kind of hint in its empty panels). */
function NothingSelected() {
  return (
    <div className="of-panel__empty">
      <span className="of-empty__icon">
        <Icon name="pointer" size={20} />
      </span>
      <strong>Cliquez sur un élément de la page</strong>
      <span>
        Un texte, un bouton, une image ou une section : ses réglages s'affichent ici. Les textes
        s'écrivent aussi directement sur la page.
      </span>
    </div>
  );
}

/**
 * « Contenu »: the clicked element and only its fields, the other fields of the section behind a
 * disclosure; a click beside the elements (or « Afficher toute la section ») shows them all.
 */
function ContentTab({ children }: { children: ReactNode }) {
  const { focus, setFocus } = useFocus();
  const selected = usePuck((s) => s.selectedItem);
  const fields = usePuck((s) =>
    selected ? (s.config.components[selected.type]?.fields as Fields | undefined) : undefined,
  );
  const [showAll, setShowAll] = useState(false);
  const selectedId = selected?.props.id as string | undefined;

  // Another section gets selected (outline, keyboard…): the clicked element no longer applies.
  // Only on a selection change: a click sets the focus just before Puck selects its section.
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(() => {
    const current = focusRef.current;
    if (current && selectedId && current.componentId !== selectedId) setFocus(null);
  }, [selectedId, setFocus]);

  // A new element closes the other fields again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on each new element.
  useEffect(() => setShowAll(false), [focus?.componentId, focus?.path, focus?.index]);

  const group =
    selected && focus && focus.componentId === selectedId ? resolveGroup(fields, focus) : undefined;
  if (!group || !focus) {
    return (
      <>
        {selected && (
          <p className="of-panel__hint">
            <Icon name="pointer" size={13} className="of-icon--first-line" />
            <span>
              Toute la section. Cliquez sur un texte, un bouton ou une image pour ne voir que ses
              réglages.
            </span>
          </p>
        )}
        {children}
      </>
    );
  }
  return (
    <>
      <ElementPanel group={group} focus={focus} />
      <button
        type="button"
        className="of-panel__more"
        aria-expanded={showAll}
        onClick={() => setShowAll((value) => !value)}
      >
        <Icon name={showAll ? "chevronDown" : "chevronRight"} size={14} />
        Tous les champs de la section
      </button>
      {showAll && children}
    </>
  );
}

/**
 * Right panel (Puck `overrides.fields`). « Contenu »: the clicked element, or the whole section.
 * « Style »: free style of the section or element (unless `editor.styles` is `off`).
 */
export function FieldsPanel({ children }: { children: ReactNode }) {
  const { config } = useAdmin();
  const selected = usePuck((s) => s.selectedItem);
  const rootFields = usePuck((s) => Object.keys(s.config.root?.fields ?? {}).length > 0);
  const [tab, setTab] = useState<"content" | "style">("content");
  if (!selected) {
    return (
      <div className="of-panel">
        <NothingSelected />
        {rootFields && children}
      </div>
    );
  }
  if (config.editor?.styles === "off") {
    return (
      <div className="of-panel">
        <ContentTab>{children}</ContentTab>
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
      {tab === "content" ? <ContentTab>{children}</ContentTab> : <StylePanel />}
    </div>
  );
}
