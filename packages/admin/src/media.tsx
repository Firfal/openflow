import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdmin } from "./context.js";
import {
  ACCEPTED_IMAGES,
  ACCEPTED_VIDEOS,
  listMedia,
  type MediaEntry,
  type MediaKind,
  uploadMedia,
} from "./data.js";
import { errorMessage } from "./firebase.js";
import { Icon } from "./icons.js";
import { PageHead } from "./shell.js";
import { Button, Dialog, EmptyState, formatDate } from "./ui.js";

type Filter = "all" | "storage" | "static";

const FILTERS: Array<[Filter, string]> = [
  ["all", "Tout"],
  ["storage", "Importés"],
  ["static", "Fichiers du site"],
];

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Media of the library, loaded while `active` (reloaded by `reload`). */
function useMedia(active: boolean) {
  const { services } = useAdmin();
  const [items, setItems] = useState<MediaEntry[] | null>(null);
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` forces a reload after an upload.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    listMedia(services.db).then(
      (media) => !cancelled && setItems(media),
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [active, services.db, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { items, error, reload };
}

function Filters({ filter, onChange }: { filter: Filter; onChange: (filter: Filter) => void }) {
  return (
    <fieldset className="of-segmented of-media-filters">
      <legend className="of-sr-only">Afficher</legend>
      {FILTERS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={filter === value}
          className={filter === value ? "is-active" : ""}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}

function Search({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="of-search" style={{ flex: "1 1 180px", maxWidth: 280 }}>
      <Icon name="search" size={14} className="of-search__icon" />
      <input
        className="of-input"
        type="search"
        aria-label="Rechercher un fichier"
        placeholder="Rechercher…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Thumb({ item }: { item: MediaEntry }) {
  return item.contentType.startsWith("video/") ? (
    <video src={item.url} muted preload="metadata" />
  ) : (
    <img src={item.url} alt={item.alt ?? item.name} loading="lazy" />
  );
}

function filterMedia(
  items: MediaEntry[] | null,
  kind: MediaKind | "any",
  filter: Filter,
  q: string,
) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return (items ?? []).filter(
    (item) =>
      (kind === "any" || item.contentType.startsWith(`${kind}/`)) &&
      (filter === "all" || (item.source ?? "storage") === filter) &&
      words.every((word) => fold(`${item.name} ${item.alt ?? ""}`).includes(word)),
  );
}

/**
 * Media library: files uploaded by the owner and the images or videos shipped with the site
 * (`public/`, registered by `openflow seed`), so a replaced screenshot can always be picked again.
 */
export function MediaLibrary({
  open,
  onClose,
  onPick,
  kind = "image",
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (media: MediaEntry) => void;
  kind?: MediaKind;
  /** Shows an « Importer » button (the caller opens its file picker). */
  onImport?: () => void;
}) {
  const { items, error } = useMedia(open);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () => filterMedia(items, kind, filter, query),
    [items, kind, filter, query],
  );

  return (
    <Dialog
      open={open}
      title={kind === "video" ? "Choisir une vidéo" : "Choisir une image"}
      onClose={onClose}
      wide
    >
      {error && <p className="of-error">{error}</p>}
      <div className="of-media-toolbar">
        <Filters filter={filter} onChange={setFilter} />
        <Search value={query} onChange={setQuery} />
        {onImport && (
          <Button icon="upload" onClick={onImport}>
            {kind === "video" ? "Importer une vidéo" : "Importer une image"}
          </Button>
        )}
      </div>
      {!items && !error && <p className="of-subtle">Chargement…</p>}
      {items && visible.length === 0 && (
        <EmptyState icon={kind === "video" ? "video" : "image"} title="Aucun fichier ici">
          <p>
            {query
              ? "Aucun fichier ne correspond à cette recherche."
              : kind === "video"
                ? "Importez une vidéo depuis votre ordinateur."
                : "Importez une image depuis votre ordinateur."}
          </p>
        </EmptyState>
      )}
      <div className="of-media-grid">
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            className="of-media-grid__item"
            onClick={() => onPick(item)}
            title={item.name}
          >
            <Thumb item={item} />
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function formatSize(bytes: number | undefined) {
  if (!bytes) return "";
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`
    : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

/** « Médias »: every file of the library, with upload and details. */
export function MediaView() {
  const { services, notify } = useAdmin();
  const { items, error, reload } = useMedia(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<MediaEntry | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => filterMedia(items, "any", filter, query), [items, filter, query]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        await uploadMedia(services, file, file.type.startsWith("video/") ? "video" : "image");
      }
      notify(
        "success",
        files.length > 1 ? `${files.length} fichiers importés.` : "Fichier importé.",
      );
      reload();
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const copy = (url: string) =>
    navigator.clipboard.writeText(url).then(
      () => notify("success", "Adresse copiée."),
      () => notify("error", "Copie impossible."),
    );

  return (
    <>
      <PageHead
        title="Médias"
        actions={
          <Button icon="upload" busy={busy} onClick={() => input.current?.click()}>
            Importer
          </Button>
        }
      />
      <section className="of-view">
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={`${ACCEPTED_IMAGES},${ACCEPTED_VIDEOS}`}
          onChange={(e) => void upload(e.target.files)}
        />
        <div className="of-media-toolbar">
          <Filters filter={filter} onChange={setFilter} />
          <Search value={query} onChange={setQuery} />
        </div>
        {error && <p className="of-error">{error}</p>}
        {!items && !error && <p className="of-subtle">Chargement…</p>}
        {items && visible.length === 0 && (
          <EmptyState icon="image" title="Aucun média ici">
            <p>Images PNG, JPEG, WebP ou AVIF et vidéos MP4 ou WebM, 15 Mo au plus.</p>
            <Button variant="primary" icon="upload" onClick={() => input.current?.click()}>
              Importer des fichiers
            </Button>
          </EmptyState>
        )}
        <div className="of-media-grid">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className="of-media-grid__item"
              onClick={() => setSelected(item)}
              title={item.name}
            >
              <Thumb item={item} />
              <span className="of-media-grid__name">{item.name}</span>
            </button>
          ))}
        </div>
      </section>
      <Dialog
        open={Boolean(selected)}
        title={selected?.name ?? ""}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            {selected.contentType.startsWith("video/") ? (
              <video
                className="of-image-field__preview"
                src={selected.url}
                controls
                muted
                playsInline
              />
            ) : (
              <img
                className="of-image-field__preview"
                src={selected.url}
                alt={selected.alt ?? ""}
              />
            )}
            <ul className="of-changes">
              <li>
                <span className="of-subtle">Type</span>
                <span style={{ marginLeft: "auto" }}>{selected.contentType}</span>
              </li>
              {selected.width && selected.height && (
                <li>
                  <span className="of-subtle">Dimensions</span>
                  <span style={{ marginLeft: "auto" }}>
                    {selected.width} × {selected.height} px
                  </span>
                </li>
              )}
              {selected.size ? (
                <li>
                  <span className="of-subtle">Poids</span>
                  <span style={{ marginLeft: "auto" }}>{formatSize(selected.size)}</span>
                </li>
              ) : null}
              <li>
                <span className="of-subtle">Origine</span>
                <span style={{ marginLeft: "auto" }}>
                  {selected.source === "static"
                    ? "Fichier du site"
                    : `Importé le ${formatDate(selected.createdAt)}`}
                </span>
              </li>
            </ul>
            <div className="of-row">
              <Button icon="copy" onClick={() => void copy(selected.url)}>
                Copier l'adresse
              </Button>
              <a
                className="of-btn of-btn--ghost"
                href={selected.url}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="externalLink" />
                Ouvrir
              </a>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
