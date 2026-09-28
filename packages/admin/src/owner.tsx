import type { OpenFlowConfig, SettingsDoc } from "@openflow/core";
import type { User } from "firebase/auth";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantView } from "./assistant.js";
import { CollectionView } from "./collection.js";
import { CommandPalette } from "./command.js";
import { ConnectView } from "./connect.js";
import {
  type AdminContextValue,
  AdminProvider,
  type Notice,
  useAdmin,
  useRouter,
} from "./context.js";
import {
  type AgentEntry,
  type MessageEntry,
  type PageEntry,
  type ReleaseEntry,
  subscribeAgents,
  subscribeMessages,
  subscribePages,
  subscribeReleases,
  subscribeSettings,
} from "./data.js";
import { type AuthServices, errorMessage } from "./firebase.js";
import { HistoryView } from "./history.js";
import { Icon, type IconName } from "./icons.js";
import { MediaView } from "./media.js";
import { MessagesView } from "./messages.js";
import { PagesView } from "./pages.js";
import { withFirestore } from "./services.js";
import { SettingsView } from "./settings.js";
import { Sidebar } from "./shell.js";
import { StatsView } from "./stats.js";
import { IconButton, Spinner } from "./ui.js";
import { useWebMcp } from "./webmcp.js";

/**
 * Second stage of the admin, loaded once the owner is signed in: Firestore and the dashboard. The
 * visual editor (Puck, rich text, drag and drop) is a third stage, loaded when a page is opened.
 */
const EditorView = lazy(() => import("./editor.js").then((m) => ({ default: m.EditorView })));

const NOTICE_ICONS: Record<Notice["kind"], IconName> = {
  success: "circleCheck",
  error: "circleAlert",
  info: "info",
};

function Notices({ notices, dismiss }: { notices: Notice[]; dismiss: (id: number) => void }) {
  return (
    <div className="of-notices" aria-live="polite">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`of-notice of-notice--${notice.kind}`}
          role={notice.kind === "error" ? "alert" : undefined}
        >
          <Icon name={NOTICE_ICONS[notice.kind]} className="of-icon--first-line" />
          <span>{notice.text}</span>
          <IconButton icon="x" label="Fermer" size="sm" onClick={() => dismiss(notice.id)} />
        </div>
      ))}
    </div>
  );
}

/** Dashboard (sidebar + view) or, for a page, the full-screen editor. */
function Shell() {
  const { route } = useAdmin();
  if (route.view === "editor") {
    return (
      <Suspense fallback={<Spinner label="Ouverture de la page…" />}>
        <EditorView
          key={`${route.pageId}:${route.locale ?? ""}`}
          pageId={route.pageId}
          locale={route.locale}
        />
      </Suspense>
    );
  }
  if (route.view === "connect") return <ConnectView requestId={route.request} />;
  return (
    <div className="of-shell">
      <Sidebar />
      <main className="of-main">
        {route.view === "pages" && <PagesView />}
        {route.view === "collection" && (
          <CollectionView key={route.collection} name={route.collection} />
        )}
        {route.view === "media" && <MediaView />}
        {route.view === "assistant" && <AssistantView />}
        {route.view === "messages" && <MessagesView />}
        {route.view === "stats" && <StatsView />}
        {route.view === "settings" && <SettingsView tab={route.tab ?? "global"} />}
        {route.view === "history" && <HistoryView />}
      </main>
    </div>
  );
}

/** The signed-in owner's admin: Firestore, the dashboard views, and the editor on demand. */
export function OwnerApp({
  config,
  base,
  user,
}: {
  config: OpenFlowConfig;
  base: AuthServices;
  user: User;
}) {
  const services = useMemo(() => withFirestore(base), [base]);
  const [route, navigate] = useRouter();
  const [pages, setPages] = useState<PageEntry[] | null>(null);
  const [settings, setSettings] = useState<SettingsDoc | undefined>();
  const [releases, setReleases] = useState<ReleaseEntry[]>([]);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setNotices((all) => all.filter((n) => n.id !== id)),
    [],
  );
  const notify = useCallback(
    (kind: Notice["kind"], text: string) => {
      const id = nextId.current++;
      setNotices((all) => [...all.slice(-3), { id, kind, text }]);
      setTimeout(() => dismiss(id), kind === "error" ? 9000 : 5000);
    },
    [dismiss],
  );

  useEffect(() => {
    const onError = (error: Error) => notify("error", errorMessage(error));
    const unsubscribers = [
      subscribePages(services.db, setPages, onError),
      subscribeSettings(services.db, setSettings, onError),
      subscribeReleases(services.db, setReleases, onError),
      subscribeAgents(services.db, setAgents, onError),
      subscribeMessages(services.db, setMessages, onError),
    ];
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [services.db, notify]);

  // WebMCP: the assistant of the browser edits the site with the owner's session.
  useWebMcp(services, config);

  // The editor is downloaded while the owner looks at the dashboard: « Modifier » opens at once.
  useEffect(() => {
    const prefetch = () => void import("./editor.js").catch(() => undefined);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 2000);
    return () => clearTimeout(id);
  }, []);

  const value = useMemo<AdminContextValue | null>(
    () =>
      pages
        ? {
            config,
            services,
            user,
            pages,
            settings,
            releases,
            agents,
            messages,
            route,
            navigate,
            notify,
          }
        : null,
    [config, services, user, pages, settings, releases, agents, messages, route, navigate, notify],
  );
  if (!value) return <Spinner label="Chargement du site…" />;
  return (
    <AdminProvider value={value}>
      <Shell />
      <CommandPalette />
      <Notices notices={notices} dismiss={dismiss} />
    </AdminProvider>
  );
}
