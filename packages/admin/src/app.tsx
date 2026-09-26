import { FUNCTION_NAMES, type OpenFlowConfig, OWNER_CLAIM, type SettingsDoc } from "@openflow/core";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserAgentContext, useWebMcp } from "./agent.js";
import { CommandPalette } from "./command.js";
import {
  type AdminContextValue,
  AdminProvider,
  type Notice,
  useAdmin,
  useRouter,
} from "./context.js";
import {
  type PageEntry,
  type ReleaseEntry,
  subscribePages,
  subscribeReleases,
  subscribeSettings,
} from "./data.js";
import { EditorView } from "./editor.js";
import { call, errorMessage, type FirebaseSetup, initServices, type Services } from "./firebase.js";
import { HistoryView } from "./history.js";
import { Icon, type IconName } from "./icons.js";
import { Login } from "./login.js";
import { MediaView } from "./media.js";
import { PagesView } from "./pages.js";
import { SettingsView } from "./settings.js";
import { Sidebar } from "./shell.js";
import { Button, IconButton, Spinner } from "./ui.js";
import { UiThemeContext, useUiThemeState } from "./ui-theme.js";

export interface OpenFlowAdminProps {
  /** The site's `openflow.config.tsx` default export. */
  config: OpenFlowConfig;
  /** Firebase connection (defaults to `/__/firebase/init.json` from Firebase Hosting). */
  firebase?: FirebaseSetup;
}

type OwnerState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "checking"; user: User }
  | { status: "denied"; user: User; reason: string }
  | { status: "owner"; user: User };

async function checkOwner(services: Services, user: User): Promise<string | undefined> {
  if ((await user.getIdTokenResult()).claims[OWNER_CLAIM] === true) return undefined;
  try {
    await call(services, FUNCTION_NAMES.claimOwner, {});
  } catch (error) {
    return errorMessage(error);
  }
  const refreshed = await user.getIdTokenResult(true);
  return refreshed.claims[OWNER_CLAIM] === true
    ? undefined
    : "Ce compte n'a pas accès à l'administration.";
}

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
  if (route.view === "editor") return <EditorView key={route.pageId} pageId={route.pageId} />;
  return (
    <div className="of-shell">
      <Sidebar />
      <main className="of-main">
        {route.view === "pages" && <PagesView />}
        {route.view === "media" && <MediaView />}
        {route.view === "settings" && <SettingsView tab={route.tab ?? "global"} />}
        {route.view === "history" && <HistoryView />}
      </main>
    </div>
  );
}

function OwnerApp({
  config,
  services,
  user,
}: {
  config: OpenFlowConfig;
  services: Services;
  user: User;
}) {
  const [route, navigate] = useRouter();
  const [pages, setPages] = useState<PageEntry[] | null>(null);
  const [settings, setSettings] = useState<SettingsDoc | undefined>();
  const [releases, setReleases] = useState<ReleaseEntry[]>([]);
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
    ];
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [services.db, notify]);

  // WebMCP: the assistant of the browser edits the site with the owner's session.
  const agentContext = useMemo(() => browserAgentContext(services, config), [services, config]);
  const getAgentContext = useCallback(() => agentContext, [agentContext]);
  useWebMcp(getAgentContext);

  const value = useMemo<AdminContextValue | null>(
    () =>
      pages ? { config, services, user, pages, settings, releases, route, navigate, notify } : null,
    [config, services, user, pages, settings, releases, route, navigate, notify],
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

function Blocked({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="of-login">
      <div className="of-card of-login__card">
        <h1>{title}</h1>
        <div className="of-login__body">{children}</div>
      </div>
    </main>
  );
}

function AdminRoot({ config, firebase }: OpenFlowAdminProps) {
  const [services, setServices] = useState<Services>();
  const [fatal, setFatal] = useState<string>();
  const [owner, setOwner] = useState<OwnerState>({ status: "loading" });

  // biome-ignore lint/correctness/useExhaustiveDependencies: Firebase is initialized once per page load.
  useEffect(() => {
    initServices(firebase).then(setServices, (error: Error) => setFatal(error.message));
  }, []);

  useEffect(() => {
    if (!services) return;
    return onAuthStateChanged(services.auth, (user) => {
      if (!user) {
        setOwner({ status: "signed-out" });
        return;
      }
      setOwner({ status: "checking", user });
      checkOwner(services, user).then((reason) =>
        setOwner(reason ? { status: "denied", user, reason } : { status: "owner", user }),
      );
    });
  }, [services]);

  if (fatal) {
    return (
      <Blocked title="Administration indisponible">
        <p className="of-error">{fatal}</p>
      </Blocked>
    );
  }
  if (!services || owner.status === "loading") return <Spinner />;
  if (owner.status === "signed-out")
    return <Login services={services} siteName={config.site.name} />;
  if (owner.status === "checking") return <Spinner label="Vérification de vos droits…" />;
  if (owner.status === "denied") {
    return (
      <Blocked title="Accès refusé">
        <p>
          Le compte <strong>{owner.user.email}</strong> n'est pas le propriétaire de ce site.
        </p>
        <p className="of-subtle">{owner.reason}</p>
        <Button onClick={() => signOut(services.auth)}>Changer de compte</Button>
      </Blocked>
    );
  }
  return <OwnerApp config={config} services={services} user={owner.user} />;
}

/** Full OpenFlow admin: owner authentication, pages, visual editor, settings, publication. */
export function OpenFlowAdminApp(props: OpenFlowAdminProps) {
  const theme = useUiThemeState();
  return (
    <UiThemeContext.Provider value={theme}>
      <div className="of-root">
        <AdminRoot {...props} />
      </div>
    </UiThemeContext.Provider>
  );
}
