import { applyDefaults, PAGE_SIZE_WARNING_BYTES, slugToPath } from "@openflow/core";
import { type Data, Puck } from "@puckeditor/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type SaveState, useAutosave } from "./autosave.js";
import { useAdmin } from "./context.js";
import { getPage, type PageEntry, savePageData } from "./data.js";
import { prepareEditorConfig } from "./fields.js";
import { errorMessage } from "./firebase.js";
import { FR_DICTIONARY } from "./i18n.js";
import { Button, Spinner } from "./ui.js";

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

export function EditorView({ pageId }: { pageId: string }) {
  const { config, services, user, notify, navigate } = useAdmin();
  const [page, setPage] = useState<PageEntry | null | undefined>(undefined);
  const lastSaved = useRef<string>("");
  const warned = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getPage(services.db, pageId).then(
      (loaded) => {
        if (cancelled) return;
        setPage(loaded ?? null);
        if (loaded) lastSaved.current = JSON.stringify(applyDefaults(loaded.data, config));
      },
      (error) => notify("error", errorMessage(error)),
    );
    return () => {
      cancelled = true;
    };
  }, [pageId, services.db, config, notify]);

  const save = useCallback(
    async (data: Data) => {
      const json = JSON.stringify(data);
      if (json === lastSaved.current) return;
      const size = await savePageData(services.db, pageId, data, user.email ?? undefined);
      lastSaved.current = json;
      if (size > PAGE_SIZE_WARNING_BYTES && !warned.current) {
        warned.current = true;
        notify(
          "info",
          "Cette page devient volumineuse : pensez à répartir son contenu sur plusieurs pages.",
        );
      }
    },
    [services.db, pageId, user.email, notify],
  );
  const autosave = useAutosave(save);

  const editorConfig = useMemo(() => prepareEditorConfig(config), [config]);
  const initialData = useMemo(
    () => (page ? applyDefaults(page.data, config) : undefined),
    [page, config],
  );

  if (page === undefined) return <Spinner label="Ouverture de la page…" />;
  if (page === null) {
    return (
      <section className="of-view">
        <p className="of-error">Cette page n'existe plus.</p>
        <Button onClick={() => navigate({ view: "pages" })}>Retour aux pages</Button>
      </section>
    );
  }

  return (
    <div className="of-editor">
      <Puck
        config={editorConfig}
        data={initialData!}
        onChange={autosave.schedule}
        dictionary={FR_DICTIONARY}
        headerTitle={page.title}
        headerPath={slugToPath(page.slug)}
        height="calc(100dvh - var(--of-topbar-height))"
        iframe={{ enabled: true, waitForStyles: true }}
        metadata={{ page: { id: page.id, slug: page.slug, title: page.title } }}
        overrides={{
          headerActions: () => (
            <>
              <SaveIndicator
                state={autosave.state}
                error={autosave.error}
                onRetry={() => void autosave.flush()}
              />
              <Button
                variant="ghost"
                onClick={async () => {
                  await autosave.flush();
                  navigate({ view: "pages" });
                }}
              >
                Terminer
              </Button>
            </>
          ),
        }}
      />
    </div>
  );
}
