import { FUNCTION_NAMES } from "@openflow/core";
import { useEffect, useState } from "react";
import { useAdmin } from "./context.js";
import { call, errorMessage } from "./firebase.js";
import { Icon } from "./icons.js";
import { SiteMark } from "./shell.js";
import { Button, Spinner } from "./ui.js";

interface RequestInfo {
  clientName: string;
  /** Where the owner is sent back, in words (« claude.ai », « l'application cursor »). */
  redirect: string;
  redirectKind: "web" | "local" | "app";
  redirectHost: string;
  expiresAt: string;
}

/** Hosts of well-known assistants: their name is confirmed next to the one the client gave. */
const KNOWN_HOSTS: Record<string, string> = {
  "claude.ai": "Claude",
  "claude.com": "Claude",
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "vscode.dev": "VS Code",
  "insiders.vscode.dev": "VS Code",
};

type State =
  | { status: "loading" }
  | { status: "ready"; info: RequestInfo }
  | { status: "sending"; info: RequestInfo; approve: boolean }
  | { status: "done"; info: RequestInfo; approve: boolean; redirectUrl: string }
  | { status: "error"; message: string };

/**
 * Consent screen of an AI assistant connecting with OAuth (`/admin/?view=connect&request=…`):
 * `cmsMcp` sends the owner here from the assistant; « Autoriser » gives it a single-use code
 * through `cmsAgentConsent`, then the browser goes back to the assistant.
 */
export function ConnectView({ requestId }: { requestId: string }) {
  const { services, settings, config, user, navigate } = useAdmin();
  const siteName = settings?.site?.name ?? config.site.name;
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    call<{ requestId: string }, RequestInfo>(services, FUNCTION_NAMES.agentConsent, { requestId })
      .then((info) => active && setState({ status: "ready", info }))
      .catch((error) => active && setState({ status: "error", message: errorMessage(error) }));
    return () => {
      active = false;
    };
  }, [services, requestId]);

  const answer = async (info: RequestInfo, approve: boolean) => {
    setState({ status: "sending", info, approve });
    try {
      const { redirectUrl } = await call<
        { requestId: string; decision: "approve" | "deny" },
        { redirectUrl: string }
      >(services, FUNCTION_NAMES.agentConsent, {
        requestId,
        decision: approve ? "approve" : "deny",
      });
      setState({ status: "done", info, approve, redirectUrl });
      window.location.assign(redirectUrl);
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  };

  const back = (
    <Button variant="ghost" icon="arrowLeft" onClick={() => navigate({ view: "assistant" })}>
      Aller à l'admin
    </Button>
  );

  if (state.status === "loading") return <Spinner label="Demande de connexion…" />;

  return (
    <main className="of-login">
      <div className="of-card of-login__card of-connect">
        <div className="of-connect__marks" aria-hidden>
          <SiteMark name={siteName} />
          <span className="of-connect__link" />
          <span className="of-connect__ai">
            <Icon name="sparkles" size={18} />
          </span>
        </div>

        {state.status === "error" ? (
          <>
            <h1>Connexion impossible</h1>
            <p className="of-error">{state.message}</p>
            <div className="of-row">{back}</div>
          </>
        ) : state.status === "done" ? (
          <>
            <h1>{state.approve ? "Connexion autorisée" : "Connexion refusée"}</h1>
            <p className="of-muted">
              Retour vers {state.info.redirect}… Si rien ne se passe, revenez à votre assistant :
              vous pouvez fermer cet onglet.
            </p>
            <div className="of-row">
              <a className="of-btn of-btn--secondary" href={state.redirectUrl}>
                <Icon name="externalLink" />
                Revenir à l'assistant
              </a>
              {back}
            </div>
          </>
        ) : (
          <ConsentForm
            info={state.info}
            siteName={siteName}
            email={user.email ?? ""}
            sending={state.status === "sending" ? state.approve : undefined}
            onAnswer={(approve) => void answer(state.info, approve)}
          />
        )}
      </div>
    </main>
  );
}

function ConsentForm({
  info,
  siteName,
  email,
  sending,
  onAnswer,
}: {
  info: RequestInfo;
  siteName: string;
  email: string;
  sending: boolean | undefined;
  onAnswer: (approve: boolean) => void;
}) {
  const known = KNOWN_HOSTS[info.redirectHost];
  // An unknown web site is the case worth a warning (an app of this computer is expected).
  const web = info.redirectKind === "web";
  return (
    <>
      <h1>
        Autoriser «{"\u00a0"}
        {info.clientName}
        {"\u00a0"}» à modifier {siteName}
        {"\u00a0"}?
      </h1>
      <p className="of-muted">
        Connecté en tant que <strong>{email}</strong>, propriétaire du site.
      </p>
      <ul className="of-connect__rights">
        <li>
          <Icon name="check" className="of-icon--first-line" />
          <span>Lire et modifier les pages, les textes, les images et le style</span>
        </li>
        <li>
          <Icon name="check" className="of-icon--first-line" />
          <span>Créer des pages, modifier les réglages et importer des images</span>
        </li>
        <li>
          <Icon name="check" className="of-icon--first-line" />
          <span>Publier le site, quand vous le lui demandez</span>
        </li>
      </ul>
      {known ? (
        <p className="of-callout of-callout--success">
          <Icon name="shieldCheck" className="of-icon--first-line" />
          <span>
            Vous serez renvoyé vers <strong>{info.redirect}</strong> ({known}).
          </span>
        </p>
      ) : (
        <p className={`of-callout${web ? " of-callout--warning" : ""}`}>
          <Icon name={web ? "circleAlert" : "info"} className="of-icon--first-line" />
          <span>
            Vous serez renvoyé vers <strong>{info.redirect}</strong>. N'autorisez que si vous venez
            de lancer la connexion depuis cet assistant.
          </span>
        </p>
      )}
      <p className="of-subtle">
        Rien n'est mis en ligne sans publication. Vous pourrez déconnecter cet assistant à tout
        moment dans Assistant IA.
      </p>
      <div className="of-row of-row--end">
        <Button
          disabled={sending !== undefined}
          busy={sending === false}
          onClick={() => onAnswer(false)}
        >
          Refuser
        </Button>
        <Button
          variant="primary"
          icon="check"
          disabled={sending !== undefined}
          busy={sending === true}
          onClick={() => onAnswer(true)}
        >
          Autoriser
        </Button>
      </div>
    </>
  );
}
