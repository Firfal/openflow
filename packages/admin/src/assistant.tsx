import {
  AGENT_TOOLS,
  type AgentTokenDoc,
  COLLECTIONS,
  FUNCTION_NAMES,
  slugify,
} from "@openflow/core";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useWebMcpState } from "./agent.js";
import { useAdmin } from "./context.js";
import { call, errorMessage } from "./firebase.js";
import { Icon } from "./icons.js";
import { Button, FormField, StatusChip } from "./ui.js";

type KeyEntry = AgentTokenDoc & { id: string };

function formatDate(iso?: string) {
  return iso
    ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
    : "jamais";
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { notify } = useAdmin();
  return (
    <div className="of-copy">
      <span className="of-field__label">{label}</span>
      <div className="of-copy__row">
        <code className="of-copy__value">{value}</code>
        <Button
          variant="secondary"
          icon="copy"
          onClick={() =>
            navigator.clipboard.writeText(value).then(
              () => notify("success", "Copié."),
              () => notify("error", "Copie impossible : sélectionnez le texte."),
            )
          }
        >
          Copier
        </Button>
      </div>
    </div>
  );
}

/**
 * Réglages > Assistant IA: connects an AI assistant (Claude, ChatGPT…) to the site through the
 * MCP server, with keys the owner creates and revokes; and shows WebMCP for browser assistants.
 */
export function AssistantSettings() {
  const { services, config, settings, notify } = useAdmin();
  const webMcp = useWebMcpState();
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [label, setLabel] = useState("Claude");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ token: string; label: string }>();

  useEffect(
    () =>
      onSnapshot(
        query(collection(services.db, COLLECTIONS.agentTokens), orderBy("createdAt", "desc")),
        (snap) => setKeys(snap.docs.map((d) => ({ id: d.id, ...(d.data() as AgentTokenDoc) }))),
        (error) => notify("error", errorMessage(error)),
      ),
    [services.db, notify],
  );

  const endpoint = services.emulators
    ? `http://${services.emulatorHost ?? "127.0.0.1"}:5001/${services.projectId}/${services.region}/${FUNCTION_NAMES.mcp}`
    : `https://${services.region}-${services.projectId}.cloudfunctions.net/${FUNCTION_NAMES.mcp}`;
  const siteName = settings?.site?.name ?? config.site.name;
  const serverName = slugify(siteName) || "mon-site";

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

  const revoke = async (key: KeyEntry) => {
    if (
      !window.confirm(
        `Révoquer la clé « ${key.label} » ? L'assistant qui l'utilise perdra l'accès.`,
      )
    ) {
      return;
    }
    try {
      await deleteDoc(doc(services.db, COLLECTIONS.agentTokens, key.id));
      notify("success", "Clé révoquée.");
    } catch (error) {
      notify("error", errorMessage(error));
    }
  };

  return (
    <div className="of-assistant">
      <section className="of-card of-form">
        <div>
          <h2>Modifier le site en discutant avec une IA</h2>
          <p className="of-card__lead">
            Connectez Claude, ChatGPT ou tout assistant compatible MCP, puis demandez-lui « change
            le titre de l'accueil », « ajoute une question à la FAQ » ou « mets les titres en bleu
            sur mobile ».
          </p>
        </div>
        <ol className="of-steps">
          <li>Créez une clé d'accès ci-dessous et donnez-lui un nom.</li>
          <li>Copiez les réglages proposés dans votre assistant.</li>
          <li>
            Discutez : ses modifications sont des brouillons, visibles en direct dans l'éditeur.
            Rien n'est en ligne avant la publication.
          </li>
        </ol>
        <p className="of-callout">
          <Icon name="info" className="of-icon--first-line" />
          <span>
            L'assistant n'a accès qu'à ce site (pages, sections, réglages), jamais au code ni aux
            autres données du projet. Une clé se révoque d'un clic.
          </span>
        </p>
        <CopyField label="Adresse du serveur MCP" value={endpoint} />
      </section>

      <section className="of-card of-form">
        <div>
          <h2>Clés d'accès</h2>
          <p className="of-card__lead">Une clé par assistant ou par appareil.</p>
        </div>
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
            <h3>Claude (application ou claude.ai)</h3>
            <p className="of-muted">
              Paramètres &gt; Connecteurs &gt; Ajouter un connecteur personnalisé, puis collez cette
              adresse (elle contient la clé : gardez-la pour vous) :
            </p>
            <CopyField label="Adresse avec la clé" value={`${endpoint}?key=${created.token}`} />
            <h3>Claude Code</h3>
            <CopyField
              label="Commande"
              value={`claude mcp add --transport http ${serverName} ${endpoint} --header "Authorization: Bearer ${created.token}"`}
            />
            <h3>Autres assistants (configuration JSON)</h3>
            <CopyField
              label="Configuration"
              value={JSON.stringify({
                mcpServers: {
                  [serverName]: {
                    url: endpoint,
                    headers: { Authorization: `Bearer ${created.token}` },
                  },
                },
              })}
            />
            <div className="of-row">
              <Button variant="primary" icon="check" onClick={() => setCreated(undefined)}>
                J'ai copié la clé
              </Button>
            </div>
          </div>
        ) : (
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
        )}
        {!created && (
          <p className="of-field__hint" style={{ marginTop: -10 }}>
            Pour la reconnaître : « Claude sur mon ordinateur », « ChatGPT »…
          </p>
        )}
        {keys.length > 0 ? (
          <ul className="of-list">
            {keys.map((key) => (
              <li key={key.id} className="of-list__item">
                <span className="of-list__icon" aria-hidden>
                  <Icon name="key" />
                </span>
                <div className="of-list__main">
                  <span className="of-list__title">{key.label}</span>
                  <span className="of-list__meta">
                    <span className="of-mono">{key.prefix}…</span>
                    <span>créée le {formatDate(key.createdAt)}</span>
                    <span>utilisée : {formatDate(key.lastUsedAt)}</span>
                  </span>
                </div>
                <Button variant="danger-ghost" size="sm" onClick={() => void revoke(key)}>
                  Révoquer
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="of-subtle">Aucune clé pour l'instant.</p>
        )}
      </section>

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
