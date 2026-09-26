import {
  AGENT_AUTHOR,
  applyDefaults,
  COLLECTIONS,
  PAGE_SIZE_WARNING_BYTES,
  type PageDoc,
  slugToPath,
} from "@openflow/core";
import { type Data, Puck } from "@puckeditor/core";
import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getEditorBridge } from "./agent.js";
import { useAutosave } from "./autosave.js";
import { useAdmin } from "./context.js";
import { getPage, type PageEntry, savePageData } from "./data.js";
import {
  EDITOR_IFRAME,
  EDITOR_VIEWPORTS,
  type EditorChrome,
  EditorChromeContext,
  editorUi,
  PAGE_EDITOR_OVERRIDES,
  PAGE_EDITOR_PLUGINS,
} from "./editor-ui.js";
import { prepareEditorConfig } from "./fields.js";
import { errorMessage } from "./firebase.js";
import { type Focus, FocusContext, type FocusStore } from "./focus.js";
import { FR_DICTIONARY } from "./i18n.js";
import { Button, EmptyState, Spinner } from "./ui.js";

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
  const metadata = useMemo(
    () => (page ? { page: { id: page.id, slug: page.slug, title: page.title } } : {}),
    [page],
  );
  const [focus, setFocus] = useState<Focus | null>(null);
  const focusStore = useMemo<FocusStore>(() => ({ focus, setFocus }), [focus]);
  const { flush } = autosave;
  const chrome = useMemo<EditorChrome>(
    () => ({
      kind: "page",
      saveState: autosave.state,
      saveError: autosave.error,
      retry: () => void flush(),
      open: async (next) => {
        await flush();
        navigate(next ? { view: "editor", pageId: next } : { view: "pages" });
      },
      pageId,
    }),
    [autosave.state, autosave.error, flush, navigate, pageId],
  );
  // Read once by Puck (initial screen: the closest to this device).
  const ui = useMemo(() => editorUi(), []);

  // Changes made by an AI assistant through the MCP server appear live in the editor.
  useEffect(() => {
    if (!page) return;
    return onSnapshot(doc(services.db, COLLECTIONS.pages, pageId), (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      const remote = snap.data() as PageDoc | undefined;
      if (!remote || remote.updatedBy !== AGENT_AUTHOR) return;
      const data = applyDefaults(remote.data, config);
      const json = JSON.stringify(data);
      if (json === lastSaved.current) return;
      lastSaved.current = json;
      getEditorBridge()?.setData(data);
      notify("info", "L'assistant IA a modifié cette page.");
    });
  }, [page, pageId, services.db, config, notify]);

  if (page === undefined) return <Spinner label="Ouverture de la page…" />;
  if (page === null) {
    return (
      <section className="of-view of-view--narrow" style={{ paddingTop: 64 }}>
        <EmptyState icon="fileText" title="Cette page n'existe plus">
          <p>Elle a peut-être été supprimée depuis un autre appareil.</p>
          <Button icon="arrowLeft" onClick={() => navigate({ view: "pages" })}>
            Retour aux pages
          </Button>
        </EmptyState>
      </section>
    );
  }

  // Every prop given to <Puck> keeps its identity across renders: a new `overrides`, `iframe` or
  // `metadata` object makes Puck rebuild its store and remount the canvas (e.g. mid-drag).
  return (
    <EditorChromeContext.Provider value={chrome}>
      <FocusContext.Provider value={focusStore}>
        <div className="of-editor">
          <Puck
            config={editorConfig}
            data={initialData!}
            onChange={autosave.schedule}
            dictionary={FR_DICTIONARY}
            headerTitle={page.title}
            headerPath={slugToPath(page.slug)}
            height="100dvh"
            iframe={EDITOR_IFRAME}
            viewports={EDITOR_VIEWPORTS}
            ui={ui}
            metadata={metadata}
            plugins={PAGE_EDITOR_PLUGINS}
            overrides={PAGE_EDITOR_OVERRIDES}
          />
        </div>
      </FocusContext.Provider>
    </EditorChromeContext.Provider>
  );
}
