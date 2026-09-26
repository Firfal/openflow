import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "./context.js";
import { listMedia, type MediaEntry, type MediaKind } from "./data.js";
import { errorMessage } from "./firebase.js";
import { Button, Dialog } from "./ui.js";

type Filter = "all" | "storage" | "static";

const FILTERS: Array<[Filter, string]> = [
  ["all", "Tout"],
  ["storage", "Importés"],
  ["static", "Fichiers du site"],
];

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
  const { services } = useAdmin();
  const [items, setItems] = useState<MediaEntry[] | null>(null);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<Filter>("all");

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

  const visible = useMemo(
    () =>
      (items ?? []).filter(
        (item) =>
          item.contentType.startsWith(`${kind}/`) &&
          (filter === "all" || (item.source ?? "storage") === filter),
      ),
    [items, kind, filter],
  );

  return (
    <Dialog open={open} title="Médiathèque" onClose={onClose}>
      {error && <p className="of-error">{error}</p>}
      <div className="of-media-toolbar">
        <fieldset className="of-segmented of-media-filters">
          <legend className="of-sr-only">Afficher</legend>
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              className={filter === value ? "is-active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </fieldset>
        {onImport && (
          <Button onClick={onImport}>
            {kind === "video" ? "Importer une vidéo" : "Importer une image"}
          </Button>
        )}
      </div>
      {items && visible.length === 0 && (
        <p className="of-muted">
          {kind === "video"
            ? "Aucune vidéo pour l'instant : utilisez « Importer une vidéo »."
            : "Aucune image pour l'instant : utilisez « Importer une image »."}
        </p>
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
            {kind === "video" ? (
              <video src={item.url} muted preload="metadata" />
            ) : (
              <img src={item.url} alt={item.alt ?? item.name} loading="lazy" />
            )}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
