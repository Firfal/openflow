// `no-external.css`: Puck's styles without third-party font requests. Loaded with the editor.
import "@puckeditor/core/no-external.css";
import {
  AGENT_AUTHOR,
  applyDefaults,
  applyPageTranslation,
  buildCollections,
  COLLECTIONS,
  collectTranslation,
  getCollectionConfig,
  itemMeta,
  legalDocuments,
  legalFacts,
  legalSectionsOf,
  type OpenFlowMetadata,
  PAGE_SIZE_WARNING_BYTES,
  type PageContentDoc,
  type PageTranslationDoc,
  pageTexts,
  siteLocales,
  slugToPath,
} from "@openflow/core";
import { type Data, Puck } from "@puckeditor/core";
import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAutosave } from "./autosave.js";
import { getEditorBridge } from "./bridge.js";
import { useAdmin } from "./context.js";
import { type FullPage, getPage, getTranslation, savePageData, saveTranslation } from "./data.js";
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
import { useLegalFacts } from "./legal.js";
import { TranslationContext, type TranslationMeta, type TranslationState } from "./translate.js";
import { Button, EmptyState, Spinner } from "./ui.js";

/** Structure locked in the translation editor: only texts change there. */
const TRANSLATION_PERMISSIONS = { drag: false, duplicate: false, delete: false, insert: false };

export function EditorView({ pageId, locale }: { pageId: string; locale?: string }) {
  const { config, services, user, notify, navigate, pages, settings } = useAdmin();
  const [page, setPage] = useState<FullPage | null | undefined>(undefined);
  // Another language of the site: the translation editor (texts only).
  const main = settings?.site?.lang || config.site.lang || "fr";
  const localesKey = siteLocales({ lang: main, locales: settings?.site?.locales }).join(",");
  const locales = useMemo(() => (localesKey ? localesKey.split(",") : []), [localesKey]);
  const translating = locale && locales.includes(locale) ? locale : undefined;
  const [translation, setTranslation] = useState<PageTranslationDoc | null | undefined>(
    translating ? undefined : null,
  );
  const translationRef = useRef<PageTranslationDoc | null>(null);
  const [meta, setMetaState] = useState<TranslationMeta>({ title: "", slug: "", description: "" });
  const metaRef = useRef(meta);
  const latestData = useRef<Data | undefined>(undefined);
  const lastSaved = useRef<string>("");
  const warned = useRef(false);
  // Items of a collection (article, project…): their list values follow each save.
  const collection = getCollectionConfig(config, page?.collection);
  // The site's items as they were when the page opened (sections listing a collection).
  const pagesAtOpen = useRef(pages);
  const settingsAtOpen = useRef(settings);
  // A legal page's text is written from the whole site (forms, integrations): loaded before the
  // editor opens. A legal section added meanwhile shows what the settings alone tell.
  const legalPage = page ? legalSectionsOf(page.data).length > 0 : false;
  const facts = useLegalFacts(legalPage);

  useEffect(() => {
    let cancelled = false;
    getPage(services.db, pageId).then(
      (loaded) => {
        if (cancelled) return;
        setPage(loaded ?? null);
        if (loaded && !translating) {
          lastSaved.current = JSON.stringify(applyDefaults(loaded.data, config));
        }
      },
      (error) => notify("error", errorMessage(error)),
    );
    return () => {
      cancelled = true;
    };
  }, [pageId, services.db, config, notify, translating]);

  useEffect(() => {
    if (!translating) return;
    let cancelled = false;
    getTranslation(services.db, pageId, translating).then(
      (loaded) => {
        if (cancelled) return;
        translationRef.current = loaded ?? null;
        const initial = {
          title: loaded?.title ?? "",
          slug: loaded?.slug ?? "",
          description: loaded?.seo?.description ?? "",
        };
        metaRef.current = initial;
        setMetaState(initial);
        setTranslation(loaded ?? null);
      },
      (error) => notify("error", errorMessage(error)),
    );
    return () => {
      cancelled = true;
    };
  }, [pageId, services.db, notify, translating]);

  const save = useCallback(
    async (data: Data) => {
      latestData.current = data;
      if (translating && page) {
        // The texts that differ from the default language, and the page's title and description.
        const source = pageTexts(applyDefaults(page.data, config), config);
        const previous = translationRef.current ?? undefined;
        const { values, sources } = collectTranslation(source, pageTexts(data, config), previous);
        const { title, slug, description } = metaRef.current;
        const next = {
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(slug.trim() ? { slug: slug.trim().replace(/^\/+|\/+$/g, "") } : {}),
          ...(description.trim() ? { seo: { description: description.trim() } } : {}),
          values,
          sources,
        };
        const json = JSON.stringify(next);
        if (json === lastSaved.current) return;
        await saveTranslation(services.db, pageId, translating, next, user.email ?? undefined);
        lastSaved.current = json;
        translationRef.current = {
          ...next,
          page: pageId,
          locale: translating,
          updatedAt: new Date().toISOString(),
        };
        return;
      }
      const json = JSON.stringify(data);
      if (json === lastSaved.current) return;
      const size = await savePageData(
        services.db,
        pageId,
        data,
        user.email ?? undefined,
        collection ? itemMeta(data, collection, config) : undefined,
      );
      lastSaved.current = json;
      if (size > PAGE_SIZE_WARNING_BYTES && !warned.current) {
        warned.current = true;
        notify(
          "info",
          "Cette page devient volumineuse : pensez à répartir son contenu sur plusieurs pages.",
        );
      }
    },
    [services.db, pageId, user.email, notify, collection, config, translating, page],
  );
  const autosave = useAutosave(save);
  const { schedule } = autosave;
  const setMeta = useCallback(
    (patch: Partial<TranslationMeta>) => {
      metaRef.current = { ...metaRef.current, ...patch };
      setMetaState(metaRef.current);
      if (latestData.current) schedule(latestData.current);
    },
    [schedule],
  );
  const onChange = useCallback(
    (data: Data) => {
      latestData.current = data;
      schedule(data);
    },
    [schedule],
  );

  const editorConfig = useMemo(() => prepareEditorConfig(config), [config]);
  const initialData = useMemo(() => {
    if (!page) return undefined;
    const data = applyDefaults(page.data, config);
    return translating ? applyPageTranslation(data, config, translation?.values) : data;
  }, [page, config, translating, translation]);
  const translationState = useMemo<TranslationState | null>(
    () =>
      translating && page && translation !== undefined
        ? {
            locale: translating,
            main,
            source: pageTexts(applyDefaults(page.data, config), config),
            previous: translation ?? undefined,
            meta,
            setMeta,
            page: {
              title: page.title,
              slug: page.slug,
              description: page.seo?.description,
              home: page.slug === "",
              item: Boolean(page.collection),
            },
          }
        : null,
    [translating, page, translation, main, config, meta, setMeta],
  );
  // Same as on the published site: the page, and every collection's visible items. Computed once
  // (a new `metadata` object would remount the canvas).
  const metadata = useMemo<OpenFlowMetadata>(
    () =>
      page
        ? {
            page: {
              id: page.id,
              slug: page.slug,
              title: page.title,
              ...(page.collection ? { collection: page.collection } : {}),
            },
            collections: buildCollections(pagesAtOpen.current, config),
            locale: translating ?? main,
            legal: legalDocuments({
              ...(facts ??
                legalFacts({
                  site: { ...config.site, ...(settingsAtOpen.current?.site ?? {}) },
                  pages: [],
                })),
              lang: translating ?? main,
            }),
          }
        : {},
    [page, config, facts, translating, main],
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
        navigate(
          next
            ? { view: "editor", pageId: next }
            : page?.collection && collection
              ? { view: "collection", collection: page.collection }
              : { view: "pages" },
        );
      },
      pageId,
      ...(collection
        ? { back: `Retour à « ${collection.label} »`, collection: page?.collection }
        : {}),
      ...(locales.length > 0
        ? {
            languages: { main, others: locales, current: translating ?? main },
            setLanguage: async (next: string) => {
              await flush();
              navigate({
                view: "editor",
                pageId,
                ...(next !== main ? { locale: next } : {}),
              });
            },
          }
        : {}),
    }),
    [
      autosave.state,
      autosave.error,
      flush,
      navigate,
      pageId,
      page?.collection,
      collection,
      locales,
      main,
      translating,
    ],
  );
  // Read once by Puck (initial screen: the closest to this device). No sections to add in a
  // translation: the left panel stays closed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: read once, like the rest of the UI.
  const ui = useMemo(() => editorUi(translating ? { leftSideBarVisible: false } : undefined), []);

  // Changes made by an AI assistant through the MCP server appear live in the editor.
  useEffect(() => {
    if (!page || translating) return;
    return onSnapshot(doc(services.db, COLLECTIONS.pageContent, pageId), (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      const remote = snap.data() as PageContentDoc | undefined;
      if (!remote || remote.updatedBy !== AGENT_AUTHOR) return;
      const data = applyDefaults(remote.data, config);
      const json = JSON.stringify(data);
      if (json === lastSaved.current) return;
      lastSaved.current = json;
      getEditorBridge()?.setData(data);
      notify("info", "L'assistant IA a modifié cette page.");
    });
  }, [page, pageId, services.db, config, notify, translating]);

  if (page === undefined || (legalPage && !facts) || translation === undefined) {
    return <Spinner label="Ouverture de la page…" />;
  }
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
      <TranslationContext.Provider value={translationState}>
        <FocusContext.Provider value={focusStore}>
          <div className={`of-editor${translating ? " is-translating" : ""}`}>
            <Puck
              config={editorConfig}
              data={initialData!}
              onChange={onChange}
              {...(translating ? { permissions: TRANSLATION_PERMISSIONS } : {})}
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
      </TranslationContext.Provider>
    </EditorChromeContext.Provider>
  );
}
