import { FUNCTION_NAMES, type OpenFlowConfig, OWNER_CLAIM } from "@openflow/core";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { type AuthServices, call, errorMessage, type FirebaseSetup, initAuth } from "./firebase.js";
import { Login } from "./login.js";
import { Button, Spinner } from "./ui.js";
import { UiThemeContext, useUiThemeState } from "./ui-theme.js";

/**
 * First stage of the admin: Firebase Auth and the login screen only. The dashboard (Firestore) is
 * loaded once the owner is signed in, the visual editor when a page is opened (see `owner.tsx`).
 */
const OwnerApp = lazy(() => import("./owner.js").then((m) => ({ default: m.OwnerApp })));

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

async function checkOwner(services: AuthServices, user: User): Promise<string | undefined> {
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
  const [services, setServices] = useState<AuthServices>();
  const [fatal, setFatal] = useState<string>();
  const [owner, setOwner] = useState<OwnerState>({ status: "loading" });

  // biome-ignore lint/correctness/useExhaustiveDependencies: Firebase is initialized once per page load.
  useEffect(() => {
    initAuth(firebase).then(setServices, (error: Error) => setFatal(error.message));
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
  return (
    <Suspense fallback={<Spinner label="Chargement du site…" />}>
      <OwnerApp config={config} base={services} user={owner.user} />
    </Suspense>
  );
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
