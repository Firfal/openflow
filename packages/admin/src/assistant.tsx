import { AGENT_TOOLS, COLLECTIONS, FUNCTION_NAMES, slugify } from "@openflow/core";
import { deleteDoc, doc } from "firebase/firestore";
import { type ReactNode, useState } from "react";
import { useWebMcpState } from "./agent.js";
import { useAdmin } from "./context.js";
import type { AgentEntry } from "./data.js";
import { call, errorMessage, type Services } from "./firebase.js";
import { Icon, type IconName } from "./icons.js";
import { PageHead } from "./shell.js";
import { Button, FormField, IconButton, StatusChip, timeAgo } from "./ui.js";

function formatDate(iso?: string) {
  return iso
    ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
    : "jamais";
}

/**
 * Address of the site's MCP server: `https://<site>/mcp` (Hosting rewrite to `cmsMcp`), or the
 * function itself with the local emulators (`openflow dev` has no Hosting).
 */
export function mcpEndpoint(services: Services): string {
  if (services.emulators) {
    return `http://${services.emulatorHost ?? "127.0.0.1"}:5001/${services.projectId}/${services.region}/${FUNCTION_NAMES.mcp}/mcp`;
  }
  return `${window.location.origin}/mcp`;
}

function copy(value: string, notify: (kind: "success" | "error", text: string) => void) {
  navigator.clipboard.writeText(value).then(
    () => notify("success", "Copié."),
    () => notify("error", "Copie impossible : sélectionnez le texte."),
  );
}

export function CopyField({ label, value }: { label: string; value: string }) {
  const { notify } = useAdmin();
  return (
    <div className="of-copy">
      <span className="of-field__label">{label}</span>
      <div className="of-copy__row">
        <code className="of-copy__value">{value}</code>
        <Button variant="secondary" icon="copy" onClick={() => copy(value, notify)}>
          Copier
        </Button>
      </div>
    </div>
  );
}

/** A link styled as a button (settings pages of the assistants, install links of the editors). */
function LinkButton({
  href,
  icon,
  variant = "secondary",
  children,
}: {
  href: string;
  icon: IconName;
  variant?: "primary" | "secondary";
  children: ReactNode;
}) {
  const external = href.startsWith("http");
  return (
    <a
      className={`of-btn of-btn--${variant}`}
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      <Icon name={icon} />
      {children}
    </a>
  );
}

type ClientId = "claude" | "chatgpt" | "claude-code" | "cursor" | "vscode" | "other";

const CLIENTS: Array<{ id: ClientId; label: string }> = [
  { id: "claude", label: "Claude" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
  { id: "other", label: "Autre" },
];

const CLIENT_KEY = "cms:ai-client";

function storedClient(): ClientId {
  try {
    const value = window.localStorage.getItem(CLIENT_KEY);
    return CLIENTS.some((c) => c.id === value) ? (value as ClientId) : "claude";
  } catch {
    return "claude";
  }
}

const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

/** Steps to connect one assistant, with a direct action when the assistant offers one. */
function ClientGuide({
  client,
  endpoint,
  name,
}: {
  client: ClientId;
  endpoint: string;
  name: string;
}) {
  const authorize = (
    <li>
      Cette admin s'ouvre : vérifiez le nom de l'assistant, puis cliquez sur{" "}
      <strong>Autoriser</strong>.
    </li>
  );
  switch (client) {
    case "claude":
      return (
        <>
          <ol className="of-steps">
            <li>
              Dans Claude (claude.ai ou l'application) :{" "}
              <strong>Paramètres &gt; Connecteurs</strong>, puis{" "}
              <strong>Ajouter un connecteur personnalisé</strong>.
            </li>
            <li>
              Nommez-le « {name} », collez l'adresse ci-dessus, puis cliquez sur{" "}
              <strong>Se connecter</strong>.
            </li>
            {authorize}
            <li>
              Dans une discussion, activez le connecteur (bouton des outils) et demandez ce que vous
              voulez changer.
            </li>
          </ol>
          <div className="of-row">
            <LinkButton href="https://claude.ai/settings/connectors" icon="externalLink">
              Ouvrir les connecteurs de Claude
            </LinkButton>
          </div>
        </>
      );
    case "chatgpt":
      return (
        <>
          <ol className="of-steps">
            <li>
              Dans ChatGPT :{" "}
              <strong>Paramètres &gt; Applications et connecteurs &gt; Paramètres avancés</strong>,
              activez le <strong>mode développeur</strong>.
            </li>
            <li>
              Cliquez sur <strong>Créer</strong>, nommez le connecteur « {name} », collez l'adresse
              ci-dessus et choisissez l'authentification <strong>OAuth</strong>.
            </li>
            {authorize}
            <li>
              Dans une discussion, choisissez le connecteur et demandez ce que vous voulez changer.
            </li>
          </ol>
          <p className="of-field__hint">
            Le mode développeur est réservé aux offres payantes de ChatGPT.
          </p>
          <div className="of-row">
            <LinkButton href="https://chatgpt.com/#settings/Connectors" icon="externalLink">
              Ouvrir les connecteurs de ChatGPT
            </LinkButton>
          </div>
        </>
      );
    case "claude-code":
      return (
        <ol className="of-steps">
          <li>
            <div className="of-steps__body">
              Dans un terminal, lancez :
              <CopyField
                label="Commande"
                value={`claude mcp add --transport http ${name} ${endpoint}`}
              />
            </div>
          </li>
          <li>
            Dans Claude Code, tapez <code>/mcp</code>, choisissez « {name} » puis{" "}
            <strong>Authenticate</strong>.
          </li>
          {authorize}
        </ol>
      );
    case "cursor":
      return (
        <>
          <ol className="of-steps">
            <li>Cliquez sur « Ajouter à Cursor » et confirmez l'installation dans Cursor.</li>
            <li>
              Dans <strong>Cursor Settings &gt; MCP</strong>, cliquez sur <strong>Connect</strong> à
              côté de « {name} ».
            </li>
            {authorize}
          </ol>
          <div className="of-row">
            <LinkButton
              variant="primary"
              icon="plug"
              href={`cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(name)}&config=${encodeURIComponent(base64(JSON.stringify({ url: endpoint })))}`}
            >
              Ajouter à Cursor
            </LinkButton>
          </div>
        </>
      );
    case "vscode":
      return (
        <>
          <ol className="of-steps">
            <li>Cliquez sur « Ajouter à VS Code » et confirmez l'installation dans VS Code.</li>
            <li>
              Démarrez le serveur « {name} » (liste des serveurs MCP), puis acceptez la connexion.
            </li>
            {authorize}
          </ol>
          <div className="of-row">
            <LinkButton
              variant="primary"
              icon="plug"
              href={`vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name, type: "http", url: endpoint }))}`}
            >
              Ajouter à VS Code
            </LinkButton>
          </div>
        </>
      );
    default:
      return (
        <>
          <p className="of-muted">
            Tout assistant compatible MCP (transport HTTP) et connexion OAuth se branche avec
            l'adresse ci-dessus. Configuration type :
          </p>
          <CopyField
            label="Configuration"
            value={JSON.stringify({ mcpServers: { [name]: { url: endpoint } } })}
          />
          <p className="of-field__hint">
            Votre outil ne sait pas se connecter ? Créez une clé d'accès, plus bas.
          </p>
        </>
      );
  }
}

const IDEAS = [
  "Change le titre de la page d'accueil pour « … ».",
  "Ajoute une question à la FAQ sur les délais de livraison.",
  "Réécris le texte de présentation, plus court et plus chaleureux.",
  "Mets les titres en bleu sur mobile.",
  "Crée une page Tarifs avec trois formules.",
  "Dis-moi ce qui a changé depuis la dernière publication, puis publie.",
];

function AgentRow({ agent }: { agent: AgentEntry }) {
  const { services, notify } = useAdmin();
  const oauth = agent.kind === "oauth";
  const disconnect = async () => {
    const question = oauth
      ? `Déconnecter « ${agent.label} » ? Il devra se reconnecter pour modifier le site.`
      : `Révoquer la clé « ${agent.label} » ? L'assistant qui l'utilise perdra l'accès.`;
    if (!window.confirm(question)) return;
    try {
      await deleteDoc(doc(services.db, COLLECTIONS.agentTokens, agent.id));
      notify("success", oauth ? "Assistant déconnecté." : "Clé révoquée.");
    } catch (error) {
      notify("error", errorMessage(error));
    }
  };
  return (
    <li className="of-list__item">
      <span className="of-list__icon" aria-hidden>
        <Icon name={oauth ? "sparkles" : "key"} />
      </span>
      <div className="of-list__main">
        <span className="of-list__title">{agent.label}</span>
        <span className="of-list__meta">
          {oauth ? (
            <span>connecté le {formatDate(agent.createdAt)}</span>
          ) : (
            <>
              <span className="of-mono">{agent.prefix}…</span>
              <span>clé créée le {formatDate(agent.createdAt)}</span>
            </>
          )}
          <span>
            {agent.lastUsedAt ? `utilisé ${timeAgo(agent.lastUsedAt)}` : "jamais utilisé"}
          </span>
        </span>
      </div>
      <Button variant="danger-ghost" size="sm" onClick={() => void disconnect()}>
        {oauth ? "Déconnecter" : "Révoquer"}
      </Button>
    </li>
  );
}

/** Keys, for tools that cannot sign in (scripts, older clients): shown once, revocable. */
function AccessKeys({ endpoint, name }: { endpoint: string; name: string }) {
  const { services, notify } = useAdmin();
  const [label, setLabel] = useState("Mon outil");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ token: string; label: string }>();

  const create = async () => {
    setBusy(true);
    try {
      const result = await call<{ label: string }, { id: string; token: string }>(
        services,
        FUNCTION_NAMES.createAgentToken,
        { label },
      );
      setCreated({ token: result.token, label });
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="of-card of-disclosure">
      <summary>
        <Icon name="key" />
        <span className="of-disclosure__title">
          <strong>Clé d'accès</strong>
          <span className="of-muted"> pour les outils qui ne savent pas se connecter</span>
        </span>
        <Icon name="chevronDown" className="of-disclosure__chevron" />
      </summary>
      <div className="of-form">
        {created ? (
          <div className="of-key-created" role="status">
            <p className="of-row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
              <Icon name="circleCheck" className="of-icon--first-line" />
              <span>
                <strong>Clé « {created.label} » créée.</strong> Copiez-la maintenant : elle ne sera
                plus affichée.
              </span>
            </p>
            <CopyField label="Clé" value={created.token} />
            <CopyField label="En-tête à envoyer" value={`Authorization: Bearer ${created.token}`} />
            <CopyField
              label="Configuration JSON"
              value={JSON.stringify({
                mcpServers: {
                  [name]: { url: endpoint, headers: { Authorization: `Bearer ${created.token}` } },
                },
              })}
            />
            <CopyField
              label="Adresse avec la clé (outils sans en-têtes : gardez-la pour vous)"
              value={`${endpoint}?key=${created.token}`}
            />
            <div className="of-row">
              <Button variant="primary" icon="check" onClick={() => setCreated(undefined)}>
                J'ai copié la clé
              </Button>
            </div>
          </div>
        ) : (
          <>
            <form
              className="of-row of-row--end"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <FormField label="Nom de la clé">
                <input
                  className="of-input"
                  value={label}
                  maxLength={80}
                  required
                  autoComplete="off"
                  onChange={(e) => setLabel(e.target.value)}
                />
              </FormField>
              <Button type="submit" variant="primary" icon="key" busy={busy}>
                Créer une clé
              </Button>
            </form>
            <p className="of-field__hint">
              Préférez la connexion ci-dessus quand elle est possible : rien à copier ni à garder
              secret. Une clé se révoque d'un clic dans la liste des IA connectées.
            </p>
          </>
        )}
      </div>
    </details>
  );
}

/**
 * « Assistant IA »: connects Claude, ChatGPT, Claude Code, Cursor, VS Code… to the site through its
 * MCP server (`https://<site>/mcp`, OAuth sign-in or key), lists the connected assistants, and
 * shows WebMCP for browser assistants.
 */
export function AssistantSettings() {
  const { services, config, settings, agents, notify } = useAdmin();
  const webMcp = useWebMcpState();
  const [client, setClient] = useState<ClientId>(storedClient);
  const endpoint = mcpEndpoint(services);
  const siteName = settings?.site?.name ?? config.site.name;
  const name = slugify(siteName) || "mon-site";
  const pick = (id: ClientId) => {
    setClient(id);
    try {
      window.localStorage.setItem(CLIENT_KEY, id);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  };

  return (
    <div className="of-assistant">
      <section className="of-card of-form of-assistant__hero">
        <div className="of-row of-row--spread">
          <h2>Modifiez votre site en discutant avec votre IA</h2>
          <StatusChip tone={agents.length > 0 ? "green" : "grey"}>
            {agents.length === 0
              ? "Aucune IA connectée"
              : `${agents.length} IA connectée${agents.length > 1 ? "s" : ""}`}
          </StatusChip>
        </div>
        <p className="of-card__lead">
          Collez cette adresse dans votre assistant : il vous demandera de vous connecter et
          d'autoriser l'accès. Rien d'autre à copier.
        </p>
        <CopyField label="Adresse de votre site pour l'IA (serveur MCP)" value={endpoint} />
        <p className="of-callout">
          <Icon name="shieldCheck" className="of-icon--first-line" />
          <span>
            L'assistant n'a accès qu'au contenu de ce site : pages, sections, style, réglages et
            médias. Ses modifications sont des brouillons, visibles en direct dans l'éditeur ; rien
            n'est en ligne avant la publication.
          </span>
        </p>
      </section>

      <section className="of-card of-form">
        <h2>Connecter votre assistant</h2>
        <fieldset className="of-segmented of-assistant__clients">
          <legend className="of-sr-only">Assistant</legend>
          {CLIENTS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={client === c.id}
              className={client === c.id ? "is-active" : ""}
              onClick={() => pick(c.id)}
            >
              {c.label}
            </button>
          ))}
        </fieldset>
        <ClientGuide client={client} endpoint={endpoint} name={name} />
      </section>

      <section className="of-card of-form">
        <div>
          <h2>IA connectées</h2>
          <p className="of-card__lead">
            Chaque assistant autorisé, et chaque clé. Déconnectez celles que vous n'utilisez plus.
          </p>
        </div>
        {agents.length > 0 ? (
          <ul className="of-list">
            {agents.map((agent) => (
              <AgentRow key={agent.id} agent={agent} />
            ))}
          </ul>
        ) : (
          <p className="of-subtle">Aucune IA connectée pour l'instant.</p>
        )}
      </section>

      <section className="of-card of-form">
        <div>
          <h2>Idées de demandes</h2>
          <p className="of-card__lead">
            Parlez-lui comme à un collaborateur. Il vous montre ce qu'il va faire et publie
            seulement si vous le lui demandez.
          </p>
        </div>
        <ul className="of-ideas">
          {IDEAS.map((idea) => (
            <li key={idea}>
              <Icon name="messageSquare" className="of-icon--first-line" />
              <span className="of-ideas__text">{idea}</span>
              <IconButton
                icon="copy"
                size="sm"
                label={`Copier « ${idea} »`}
                onClick={() => copy(idea, notify)}
              />
            </li>
          ))}
        </ul>
      </section>

      <AccessKeys endpoint={endpoint} name={name} />

      <section className="of-card of-form">
        <div className="of-row of-row--spread">
          <h2>Assistant du navigateur (WebMCP)</h2>
          <StatusChip tone={webMcp.status === "active" ? "green" : "grey"}>
            {webMcp.status === "active" ? "Actif" : "Non disponible"}
          </StatusChip>
        </div>
        {webMcp.status === "active" ? (
          <p className="of-muted">
            {webMcp.tools} outils sont proposés à l'assistant IA de votre navigateur tant que
            l'admin est ouverte. Il agit avec votre session, et vous confirmez vous-même la
            publication et les suppressions.
          </p>
        ) : (
          <p className="of-muted">
            Votre navigateur ne prend pas encore en charge WebMCP (navigator.modelContext). Avec un
            navigateur compatible, l'assistant intégré pourra modifier le site depuis cette page,
            avec les mêmes {AGENT_TOOLS.length} outils que le serveur MCP.
          </p>
        )}
      </section>
    </div>
  );
}

const PROMO_KEY = "cms:ai-card-hidden";

/** Card of the Pages view until an assistant is connected (or the owner hides it). */
export function AiPromo() {
  const { agents, navigate } = useAdmin();
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(PROMO_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (hidden || agents.length > 0) return null;
  const hide = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(PROMO_KEY, "1");
    } catch {
      // Private mode: hidden for this visit.
    }
  };
  return (
    <section className="of-promo" aria-label="Connecter une IA">
      <span className="of-promo__icon" aria-hidden>
        <Icon name="sparkles" size={18} />
      </span>
      <div className="of-promo__text">
        <strong>Modifiez votre site en discutant avec votre IA</strong>
        <span>
          Branchez Claude, ChatGPT ou votre éditeur de code en une minute, puis demandez-lui «
          ajoute une question à la FAQ ».
        </span>
      </div>
      <Button variant="primary" icon="plug" onClick={() => navigate({ view: "assistant" })}>
        Connecter Claude ou ChatGPT
      </Button>
      <IconButton icon="x" size="sm" label="Masquer cette suggestion" onClick={hide} />
    </section>
  );
}

/** The « Assistant IA » view of the dashboard. */
export function AssistantView() {
  return (
    <>
      <PageHead
        title="Assistant IA"
        description="Claude, ChatGPT ou votre éditeur de code modifient le site à votre demande."
      />
      <div className="of-view of-view--narrow">
        <AssistantSettings />
      </div>
    </>
  );
}
