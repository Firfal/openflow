import {
  getOpenFlowFieldKind,
  type ImageValue,
  type LinkValue,
  type VideoValue,
} from "@openflow/core";
import { AutoField, createUsePuck, type Fields, setDeep } from "@puckeditor/core";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { flushAllAutosaves } from "./autosave.js";
import { getEditorBridge } from "./bridge.js";
import { useAdmin } from "./context.js";
import { ImageInput, LinkInput, VideoInput } from "./fields.js";
import {
  type Focus,
  type FocusGroup,
  getDeep,
  type ResolvedField,
  type ResolvedList,
  resolveGroup,
  resolveList,
  useFocus,
} from "./focus.js";
import { Icon, type IconName } from "./icons.js";
import { StylePanel, useStyleSummary } from "./style-panel.js";
import { TranslationPanel, useTranslation } from "./translate.js";
import { Button, IconButton } from "./ui.js";

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
  const fields = usePuck((s) =>
    selected ? (s.config.components[selected.type]?.fields as Fields | undefined) : undefined,
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
      {group.kind === "item" && focus.path && (
        <ItemActions
          list={resolveList(fields, focus.path, focus.index)}
          focus={focus}
          props={selected.props}
          onChange={(path, next) => change(path)(next)}
        />
      )}
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

/** The list indices of a focus with its last one replaced (`"0.2"` → `"0.3"`). */
function withLastIndex(index: string | undefined, last: number): string {
  const parts = (index ?? "").split(".").filter(Boolean);
  parts[parts.length - 1] = String(last);
  return parts.join(".");
}

/**
 * Actions on a list item (a question, a card…): add one after it, duplicate, move, delete. Within
 * the list's `min` and `max`; a new item takes `defaultItemProps`. Undoable like any edit.
 */
function ItemActions({
  list,
  focus,
  props,
  onChange,
}: {
  list: ResolvedList | undefined;
  focus: Focus;
  props: Record<string, unknown>;
  onChange: (path: string, next: unknown[]) => void;
}) {
  const { setFocus } = useFocus();
  const { notify } = useAdmin();
  const undo = () => getEditorBridge()?.undo();
  if (!list) return null;
  const items = (getDeep(props, list.path) as unknown[] | undefined) ?? [];
  const { index, field } = list;
  const max = field.max ?? Number.POSITIVE_INFINITY;
  const min = field.min ?? 0;
  const noun = (field.label ?? "élément").toLowerCase();
  const update = (next: unknown[], focusIndex?: number) => {
    onChange(list.path, next);
    if (focusIndex === undefined) setFocus({ componentId: focus.componentId });
    else setFocus({ ...focus, index: withLastIndex(focus.index, focusIndex), open: undefined });
  };
  const insert = (item: unknown) =>
    update([...items.slice(0, index + 1), item, ...items.slice(index + 1)], index + 1);
  const move = (to: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    update(next, to);
  };
  return (
    <div className="of-item-actions" role="toolbar" aria-label={`Actions sur l'élément (${noun})`}>
      <Button
        size="sm"
        icon="plus"
        disabled={items.length >= max}
        title={items.length >= max ? `${max} au plus` : undefined}
        onClick={() => insert(structuredClone(field.defaultItemProps ?? {}))}
      >
        Ajouter après
      </Button>
      <IconButton
        icon="copy"
        size="sm"
        label="Dupliquer l'élément"
        disabled={items.length >= max}
        onClick={() => insert(structuredClone(items[index]))}
      />
      <IconButton
        icon="arrowUp"
        size="sm"
        label="Monter l'élément"
        disabled={index === 0}
        onClick={() => move(index - 1)}
      />
      <IconButton
        icon="arrowDown"
        size="sm"
        label="Descendre l'élément"
        disabled={index >= items.length - 1}
        onClick={() => move(index + 1)}
      />
      <IconButton
        icon="trash"
        size="sm"
        label="Supprimer l'élément"
        className="of-item-actions__delete"
        disabled={items.length <= min}
        onClick={() => {
          update(items.filter((_, n) => n !== index));
          notify("info", "Élément supprimé.", { action: { label: "Annuler", run: undo } });
        }}
      />
    </div>
  );
}

/** The section's lists (questions, cards…): « Ajouter : Questions » adds one at the end. */
function SectionLists() {
  const { setFocus } = useFocus();
  const selected = usePuck((s) => s.selectedItem);
  const dispatch = usePuck((s) => s.dispatch);
  const getSelectorForId = usePuck((s) => s.getSelectorForId);
  const fields = usePuck((s) =>
    selected ? (s.config.components[selected.type]?.fields as Fields | undefined) : undefined,
  );
  if (!selected || !fields) return null;
  const lists = Object.entries(fields).filter(
    (entry): entry is [string, Extract<Fields[string], { type: "array" }>] =>
      entry[1]?.type === "array",
  );
  if (lists.length === 0) return null;
  const add = (key: string, field: Extract<Fields[string], { type: "array" }>) => {
    const id = selected.props.id as string;
    const selector = getSelectorForId(id);
    if (!selector) return;
    const items = (selected.props[key] as unknown[] | undefined) ?? [];
    dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: {
        ...selected,
        props: {
          ...selected.props,
          [key]: [...items, structuredClone(field.defaultItemProps ?? {})],
        },
      },
    });
    const first = Object.keys(field.arrayFields ?? {})[0];
    if (first) setFocus({ componentId: id, path: `${key}.${first}`, index: String(items.length) });
  };
  return (
    <div className="of-panel__lists">
      {lists.map(([key, field]) => {
        const count = ((selected.props[key] as unknown[] | undefined) ?? []).length;
        const full = count >= (field.max ?? Number.POSITIVE_INFINITY);
        return (
          <Button
            key={key}
            size="sm"
            icon="plus"
            disabled={full}
            title={full ? `${field.max} au plus` : undefined}
            onClick={() => add(key, field)}
          >
            Ajouter : {field.label ?? key}
          </Button>
        );
      })}
    </div>
  );
}

/** Nothing selected: how to start (Webflow shows the same kind of hint in its empty panels). */
function NothingSelected() {
  const { navigate } = useAdmin();
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
      <span>
        L'en-tête et le pied de page, communs à toutes les pages, se modifient dans{" "}
        <button
          type="button"
          className="of-link-btn of-link-btn--inline"
          onClick={async () => {
            await flushAllAutosaves();
            navigate({ view: "settings", tab: "global" });
          }}
        >
          Menu et pied de page
        </button>
        .
      </span>
    </div>
  );
}

/**
 * A card of a list section was clicked (an article…): its content belongs to the item, edited on
 * its own page, which this callout opens (Webflow's « Edit collection item »).
 */
function LinkedItem({ pageId }: { pageId: string }) {
  const { pages, config, navigate } = useAdmin();
  const page = pages.find((p) => p.id === pageId);
  const collection = page?.collection ? config.collections?.[page.collection] : undefined;
  if (!page || !collection) return null;
  return (
    <div className="of-panel__item">
      <Icon name={collection.icon ?? "layers"} size={14} className="of-icon--first-line" />
      <div>
        <p>
          <strong>{page.title}</strong> est un élément de « {collection.label} » : son contenu se
          modifie sur sa propre page.
        </p>
        <Button
          size="sm"
          icon="pencil"
          onClick={async () => {
            await flushAllAutosaves();
            navigate({ view: "editor", pageId: page.id });
          }}
        >
          Modifier cet élément
        </Button>
      </div>
    </div>
  );
}

/** A disclosure whose state the browser remembers (a convenience, never site data). */
function useStoredToggle(key: string, initial: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initial : stored === "1";
    } catch {
      return initial;
    }
  });
  const toggle = useCallback(() => {
    setOpen((value) => {
      try {
        window.localStorage.setItem(key, value ? "0" : "1");
      } catch {
        // Private mode: the choice lasts for this visit.
      }
      return !value;
    });
  }, [key]);
  return [open, toggle];
}

/**
 * « Style », below the content: closed by default (content is what owners change most), its
 * header says which screen it acts on, and the browser remembers whether it is open.
 */
function StyleBlock() {
  const [open, toggle] = useStoredToggle("cms:style-open", false);
  const { screen, count } = useStyleSummary();
  const id = useId();
  return (
    <section className={`of-block${open ? " is-open" : ""}`} aria-label="Style">
      <button
        type="button"
        className="of-block__toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        <Icon name="palette" size={14} />
        <span className="of-block__title">Style</span>
        <span className="of-block__summary">
          {screen} · {count === 0 ? "aucun réglage" : `${count} réglage${count > 1 ? "s" : ""}`}
        </span>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
      </button>
      {open && (
        <div id={id}>
          <StylePanel />
        </div>
      )}
    </section>
  );
}

/**
 * Right panel (Puck `overrides.fields`), one column as in Framer and Figma:
 * - an element clicked on the page: its content (only its fields), its style below (closed by
 *   default), then the other fields of the section behind a disclosure;
 * - the section itself: all its fields, then its style.
 * No style block when `editor.styles` is `off`.
 */
export function FieldsPanel({ children }: { children: ReactNode }) {
  // The translation editor has its own panel: the texts, each under its original.
  const translation = useTranslation();
  if (translation) return <TranslationPanel />;
  return <ContentPanel>{children}</ContentPanel>;
}

function ContentPanel({ children }: { children: ReactNode }) {
  const { config } = useAdmin();
  const { focus, setFocus } = useFocus();
  const selected = usePuck((s) => s.selectedItem);
  const fields = usePuck((s) =>
    selected ? (s.config.components[selected.type]?.fields as Fields | undefined) : undefined,
  );
  const rootFields = usePuck((s) => Object.keys(s.config.root?.fields ?? {}).length > 0);
  const [showAll, setShowAll] = useState(false);
  const selectedId = selected?.props.id as string | undefined;
  const styles = config.editor?.styles !== "off";

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

  if (!selected) {
    return (
      <div className="of-panel">
        <NothingSelected />
        {rootFields && children}
      </div>
    );
  }
  const group = focus && focus.componentId === selectedId ? resolveGroup(fields, focus) : undefined;
  if (!group || !focus) {
    const item = focus?.componentId === selectedId ? focus?.item : undefined;
    return (
      <div className="of-panel">
        {item && <LinkedItem pageId={item} />}
        <p className="of-panel__hint">
          <Icon name="pointer" size={13} className="of-icon--first-line" />
          <span>
            Toute la section. Cliquez sur un texte, un bouton ou une image pour ne voir que ses
            réglages.
          </span>
        </p>
        <SectionLists />
        {children}
        {styles && <StyleBlock />}
      </div>
    );
  }
  return (
    <div className="of-panel">
      <ElementPanel group={group} focus={focus} />
      {styles && <StyleBlock />}
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
    </div>
  );
}
