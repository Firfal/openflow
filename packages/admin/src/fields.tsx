import {
  getOpenFlowFieldKind,
  type ImageValue,
  type LinkValue,
  markComponent,
  type OpenFlowConfig,
  slugToPath,
  type VideoValue,
} from "@openflow/core";
import {
  type Config,
  type CustomField,
  type Field,
  FieldLabel,
  type Fields,
} from "@puckeditor/core";
import { useEffect, useId, useRef, useState } from "react";
import { EditorFrame } from "./canvas.js";
import { useAdmin } from "./context.js";
import { ACCEPTED_IMAGES, ACCEPTED_VIDEOS, uploadMedia } from "./data.js";
import { errorMessage } from "./firebase.js";
import { MediaLibrary } from "./media.js";
import { Button } from "./ui.js";

type RenderProps<V> = Parameters<CustomField<V>["render"]>[0];

export function ImageInput({
  value,
  onChange,
  readOnly,
  label,
  openLibrary = false,
}: {
  value: ImageValue | null | undefined;
  onChange: (value: ImageValue | null) => void;
  readOnly?: boolean;
  label: string;
  /** Opens the media library right away (image clicked on the page). */
  openLibrary?: boolean;
}) {
  const { services, notify } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState(false);
  const altId = useId();
  useEffect(() => {
    if (openLibrary && !readOnly) setLibrary(true);
  }, [openLibrary, readOnly]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const media = await uploadMedia(services, file);
      onChange({
        src: media.url,
        alt: value?.alt ?? "",
        width: media.width,
        height: media.height,
      });
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
          accept={ACCEPTED_IMAGES}
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
        onImport={() => {
          setLibrary(false);
          input.current?.click();
        }}
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

export function VideoInput({
  value,
  onChange,
  readOnly,
  label,
  openLibrary = false,
}: {
  value: VideoValue | null | undefined;
  onChange: (value: VideoValue | null) => void;
  readOnly?: boolean;
  label: string;
  /** Opens the media library right away (video clicked on the page). */
  openLibrary?: boolean;
}) {
  const { services, notify } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState<"video" | "poster" | null>(null);
  const descriptionId = useId();
  useEffect(() => {
    if (openLibrary && !readOnly) setLibrary("video");
  }, [openLibrary, readOnly]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const media = await uploadMedia(services, file, "video");
      onChange({ ...value, src: media.url });
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
          <video
            className="of-image-field__preview"
            src={value.src}
            poster={value.poster}
            muted
            loop
            playsInline
            controls
          />
        ) : (
          <div className="of-image-field__empty">Aucune vidéo</div>
        )}
        <div className="of-row">
          <Button busy={busy} disabled={readOnly} onClick={() => input.current?.click()}>
            Importer une vidéo
          </Button>
          <Button variant="ghost" disabled={readOnly} onClick={() => setLibrary("video")}>
            Médiathèque
          </Button>
          {value?.src && (
            <Button variant="ghost" disabled={readOnly} onClick={() => onChange(null)}>
              Retirer
            </Button>
          )}
        </div>
        <p className="of-muted">MP4 ou WebM, 15 Mo maximum, sans son : elle est lue en boucle.</p>
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_VIDEOS}
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {value?.src && (
          <>
            <div className="of-row">
              <Button variant="ghost" disabled={readOnly} onClick={() => setLibrary("poster")}>
                {value.poster ? "Changer l'image d'aperçu" : "Ajouter une image d'aperçu"}
              </Button>
            </div>
            <label className="of-field" htmlFor={descriptionId}>
              <span className="of-field__label">Description de la vidéo (accessibilité)</span>
              <input
                id={descriptionId}
                className="of-input"
                value={value.description ?? ""}
                readOnly={readOnly}
                placeholder="Ex. : Le chef pétrit la pâte à pain"
                onChange={(e) => onChange({ ...value, description: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
      <MediaLibrary
        open={library !== null}
        kind={library === "poster" ? "image" : "video"}
        onClose={() => setLibrary(null)}
        onImport={
          library === "video"
            ? () => {
                setLibrary(null);
                input.current?.click();
              }
            : undefined
        }
        onPick={(media) => {
          const target = library;
          setLibrary(null);
          if (target === "poster" && value?.src) onChange({ ...value, poster: media.url });
          else onChange({ ...value, src: media.url });
        }}
      />
    </FieldLabel>
  );
}

function VideoFieldRender({
  field,
  name,
  value,
  onChange,
  readOnly,
}: RenderProps<VideoValue | null>) {
  return (
    <VideoInput label={field.label ?? name} value={value} onChange={onChange} readOnly={readOnly} />
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
  if (kind === "video")
    return { ...(field as CustomField<VideoValue | null>), render: VideoFieldRender } as Field;
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

/**
 * Puck config used by the editor: same components, OpenFlow fields wired to Firebase, and the
 * site layout (header, footer, theme) around the page when the config declares one.
 */
export function prepareEditorConfig(config: OpenFlowConfig): Config {
  const components = Object.fromEntries(
    Object.entries(config.components).map(([name, component]) => [
      name,
      // Element markers (data-of): the owner clicks a text or an image to select its field.
      markComponent({ ...component, fields: mapFields(component.fields) }),
    ]),
  );
  const userRoot = config.root;
  const root =
    userRoot || config.layout || config.theme
      ? {
          ...userRoot,
          fields: userRoot?.fields ? mapFields(userRoot.fields) : undefined,
          render: (props: any) => (
            <EditorFrame>{userRoot?.render ? userRoot.render(props) : props.children}</EditorFrame>
          ),
        }
      : undefined;
  return { categories: config.categories, components, root } as Config;
}
