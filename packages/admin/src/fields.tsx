import {
  getOpenFlowFieldKind,
  type ImageValue,
  type LinkValue,
  type OpenFlowConfig,
  slugToPath,
} from "@openflow/core";
import {
  type Config,
  type CustomField,
  type Field,
  FieldLabel,
  type Fields,
} from "@puckeditor/core";
import { useEffect, useId, useRef, useState } from "react";
import { useAdmin } from "./context.js";
import { ACCEPTED_MEDIA, listMedia, type MediaEntry, uploadMedia } from "./data.js";
import { errorMessage } from "./firebase.js";
import { Button, Dialog } from "./ui.js";

type RenderProps<V> = Parameters<CustomField<V>["render"]>[0];

function MediaLibrary({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (media: MediaEntry) => void;
}) {
  const { services } = useAdmin();
  const [items, setItems] = useState<MediaEntry[] | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listMedia(services.db).then(
      (media) => !cancelled && setItems(media),
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [open, services.db]);
  return (
    <Dialog open={open} title="Médiathèque" onClose={onClose}>
      {error && <p className="of-error">{error}</p>}
      {items?.length === 0 && (
        <p className="of-muted">Aucune image pour l'instant : utilisez « Importer une image ».</p>
      )}
      <div className="of-media-grid">
        {items?.map((item) => (
          <button
            key={item.id}
            type="button"
            className="of-media-grid__item"
            onClick={() => onPick(item)}
            title={item.name}
          >
            <img src={item.url} alt={item.alt ?? item.name} loading="lazy" />
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export function ImageInput({
  value,
  onChange,
  readOnly,
  label,
}: {
  value: ImageValue | null | undefined;
  onChange: (value: ImageValue | null) => void;
  readOnly?: boolean;
  label: string;
}) {
  const { services, notify } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState(false);
  const altId = useId();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const media = await uploadMedia(services, file);
      onChange({ src: media.url, alt: value?.alt ?? "", width: media.width, height: media.height });
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <FieldLabel label={label} el="div" readOnly={readOnly}>
      <div className="of-image-field">
        {value?.src ? (
          <img className="of-image-field__preview" src={value.src} alt={value.alt} />
        ) : (
          <div className="of-image-field__empty">Aucune image</div>
        )}
        <div className="of-row">
          <Button busy={busy} disabled={readOnly} onClick={() => input.current?.click()}>
            Importer une image
          </Button>
          <Button variant="ghost" disabled={readOnly} onClick={() => setLibrary(true)}>
            Médiathèque
          </Button>
          {value?.src && (
            <Button variant="ghost" disabled={readOnly} onClick={() => onChange(null)}>
              Retirer
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_MEDIA}
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {value?.src && (
          <label className="of-field" htmlFor={altId}>
            <span className="of-field__label">Description de l'image (texte alternatif)</span>
            <input
              id={altId}
              className="of-input"
              value={value.alt ?? ""}
              readOnly={readOnly}
              placeholder="Ex. : Façade de la boulangerie au lever du soleil"
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
            />
          </label>
        )}
      </div>
      <MediaLibrary
        open={library}
        onClose={() => setLibrary(false)}
        onPick={(media) => {
          setLibrary(false);
          onChange({
            src: media.url,
            alt: value?.alt || media.alt || "",
            width: media.width,
            height: media.height,
          });
        }}
      />
    </FieldLabel>
  );
}

export function LinkInput({
  value,
  onChange,
  readOnly,
  label,
}: {
  value: LinkValue | null | undefined;
  onChange: (value: LinkValue | null) => void;
  readOnly?: boolean;
  label: string;
}) {
  const { pages } = useAdmin();
  const kind = value?.kind ?? "page";
  const id = useId();
  return (
    <FieldLabel label={label} el="div" readOnly={readOnly}>
      <div className="of-link-field">
        <fieldset className="of-segmented">
          <legend className="of-sr-only">Type de lien</legend>
          {(["page", "url"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              className={kind === option ? "is-active" : ""}
              disabled={readOnly}
              onClick={() =>
                onChange(
                  option === "page"
                    ? null
                    : {
                        kind: "url",
                        href: value?.kind === "url" ? value.href : "https://",
                        newTab: value?.newTab,
                      },
                )
              }
            >
              {option === "page" ? "Page du site" : "Adresse web"}
            </button>
          ))}
        </fieldset>
        {kind === "page" ? (
          <select
            className="of-input"
            aria-label="Page de destination"
            disabled={readOnly}
            value={value?.kind === "page" ? value.pageId : ""}
            onChange={(e) => {
              const page = pages.find((p) => p.id === e.target.value);
              onChange(
                page
                  ? {
                      kind: "page",
                      pageId: page.id,
                      href: slugToPath(page.slug),
                      newTab: value?.newTab,
                    }
                  : null,
              );
            }}
          >
            <option value="">— Choisir une page —</option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title} ({slugToPath(page.slug)})
              </option>
            ))}
          </select>
        ) : (
          <input
            className="of-input"
            aria-label="Adresse web"
            readOnly={readOnly}
            value={value?.kind === "url" ? value.href : ""}
            placeholder="https://… , mailto:… ou tel:…"
            onChange={(e) =>
              onChange({ kind: "url", href: e.target.value.trim(), newTab: value?.newTab })
            }
          />
        )}
        <label className="of-checkbox" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            disabled={readOnly || !value}
            checked={Boolean(value?.newTab)}
            onChange={(e) => value && onChange({ ...value, newTab: e.target.checked })}
          />
          Ouvrir dans un nouvel onglet
        </label>
      </div>
    </FieldLabel>
  );
}

function ImageFieldRender({
  field,
  name,
  value,
  onChange,
  readOnly,
}: RenderProps<ImageValue | null>) {
  return (
    <ImageInput label={field.label ?? name} value={value} onChange={onChange} readOnly={readOnly} />
  );
}

function LinkFieldRender({
  field,
  name,
  value,
  onChange,
  readOnly,
}: RenderProps<LinkValue | null>) {
  return (
    <LinkInput label={field.label ?? name} value={value} onChange={onChange} readOnly={readOnly} />
  );
}

function mapField(field: Field): Field {
  const kind = getOpenFlowFieldKind(field);
  if (kind === "image")
    return { ...(field as CustomField<ImageValue | null>), render: ImageFieldRender } as Field;
  if (kind === "link")
    return { ...(field as CustomField<LinkValue | null>), render: LinkFieldRender } as Field;
  if (field.type === "array")
    return { ...field, arrayFields: mapFields(field.arrayFields as Fields) } as Field;
  if (field.type === "object")
    return { ...field, objectFields: mapFields(field.objectFields as Fields) } as Field;
  return field;
}

/** Replaces OpenFlow field placeholders (image, link) with their admin UI, recursively. */
export function mapFields(fields: Fields | undefined): Fields {
  return Object.fromEntries(
    Object.entries((fields ?? {}) as Record<string, Field>).map(([key, field]) => [
      key,
      mapField(field),
    ]),
  ) as Fields;
}

/** Puck config used by the editor: same components, OpenFlow fields wired to Firebase. */
export function prepareEditorConfig(config: OpenFlowConfig): Config {
  const components = Object.fromEntries(
    Object.entries(config.components).map(([name, component]) => [
      name,
      { ...component, fields: mapFields(component.fields) },
    ]),
  );
  return {
    categories: config.categories,
    components,
    root: config.root
      ? { ...config.root, fields: config.root.fields ? mapFields(config.root.fields) : undefined }
      : undefined,
  } as Config;
}
