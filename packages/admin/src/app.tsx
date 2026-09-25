import { FUNCTION_NAMES, type OpenFlowConfig, OWNER_CLAIM, type SettingsDoc } from "@openflow/core";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Login } from "./login.js";
import { PagesView } from "./pages.js";
import { PublishControl } from "./publish.js";
import { SettingsView } from "./settings.js";
import { Button, Spinner } from "./ui.js";

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

function Notices({ notices, dismiss }: { notices: Notice[]; dismiss: (id: number) => void }) {
  return (
    <div className="of-notices" aria-live="polite">
      {notices.map((notice) => (
        <div key={notice.id} className={`of-notice of-notice--${notice.kind}`}>
          <span>{notice.text}</span>
          <button
            type="button"
            className="of-icon-btn"
            aria-label="Fermer"
            onClick={() => dismiss(notice.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function Shell() {
  const { route, navigate, user, services, settings, config } = useAdmin();
  const siteName = settings?.site?.name ?? config.site.name;
  const tabs = [
    ["pages", "Pages"],
    ["settings", "Réglages"],
    ["history", "Historique"],
  ] as const;
  return (
    <div className="of-app">
      <header className="of-topbar">
        <div className="of-topbar__brand">
          <span className="of-logo" aria-hidden>
            ◆
          </span>
          <span>{siteName}</span>
        </div>
        <nav className="of-topbar__nav" aria-label="Navigation">
          {tabs.map(([view, label]) => (
            <button
              key={view}
              type="button"
              aria-current={
                route.view === view || (view === "pages" && route.view === "editor")
                  ? "page"
                  : undefined
              }
              onClick={() => navigate({ view })}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="of-topbar__actions">
          <a className="of-btn of-btn--ghost" href="/" target="_blank" rel="noreferrer">
            Voir le site ↗
          </a>
          <PublishControl />
          <Button
            variant="ghost"
            title={user.email ?? undefined}
            onClick={() => signOut(services.auth)}
          >
            Se déconnecter
          </Button>
        </div>
      </header>
      <main className="of-main">
        {route.view === "pages" && <PagesView />}
        {route.view === "editor" && <EditorView key={route.pageId} pageId={route.pageId} />}
        {route.view === "settings" && <SettingsView />}
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

  const value = useMemo<AdminContextValue | null>(
    () =>
      pages ? { config, services, user, pages, settings, releases, route, navigate, notify } : null,
    [config, services, user, pages, settings, releases, route, navigate, notify],
  );
  if (!value) return <Spinner label="Chargement du site…" />;
  return (
    <AdminProvider value={value}>
      <Shell />
      <Notices notices={notices} dismiss={dismiss} />
    </AdminProvider>
  );
}

/** Full OpenFlow admin: owner authentication, pages, visual editor, settings, publication. */
export function OpenFlowAdminApp({ config, firebase }: OpenFlowAdminProps) {
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
      <main className="of-login">
        <div className="of-card">
          <h1>Administration indisponible</h1>
          <p className="of-error">{fatal}</p>
        </div>
      </main>
    );
  }
  if (!services || owner.status === "loading") return <Spinner />;
  if (owner.status === "signed-out")
    return <Login services={services} siteName={config.site.name} />;
  if (owner.status === "checking") return <Spinner label="Vérification de vos droits…" />;
  if (owner.status === "denied") {
    return (
      <main className="of-login">
        <div className="of-card of-login__card">
          <h1>Accès refusé</h1>
          <p>
            Le compte <strong>{owner.user.email}</strong> n'est pas le propriétaire de ce site.
          </p>
          <p className="of-muted">{owner.reason}</p>
          <Button onClick={() => signOut(services.auth)}>Changer de compte</Button>
        </div>
      </main>
    );
  }
  return <OwnerApp config={config} services={services} user={owner.user} />;
}
