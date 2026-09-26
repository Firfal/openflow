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
import { Button, FormField } from "./ui.js";

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
          variant="ghost"
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
        <h2>Modifier le site en discutant avec une IA</h2>
        <p>
          Connectez votre assistant (Claude, ChatGPT ou tout outil compatible MCP) à votre site :
          demandez-lui « change le titre de l'accueil », « ajoute une question à la FAQ » ou « mets
          les titres en bleu sur mobile ». Il voit vos pages, vos sections et vos réglages.
        </p>
        <p className="of-muted">
          Ses modifications sont des brouillons, visibles en direct dans l'éditeur : rien n'est en
          ligne tant que vous (ou lui, avec votre accord) ne publiez pas. Il n'a accès à rien
          d'autre que ce site.
        </p>
        <CopyField label="Adresse du serveur MCP" value={endpoint} />
      </section>

      <section className="of-card of-form">
        <h2>Clés d'accès</h2>
        {created ? (
          <div className="of-key-created" role="status">
            <p>
              <strong>Clé « {created.label} » créée.</strong> Copiez-la maintenant : elle ne sera
              plus affichée.
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
              <Button onClick={() => setCreated(undefined)}>J'ai copié la clé</Button>
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
            <FormField
              label="Nom de la clé"
              hint="Pour la reconnaître : « Claude sur mon ordinateur »…"
            >
              <input
                className="of-input"
                value={label}
                maxLength={80}
                required
                onChange={(e) => setLabel(e.target.value)}
              />
            </FormField>
            <Button type="submit" variant="primary" busy={busy}>
              Créer une clé
            </Button>
          </form>
        )}
        {keys.length > 0 ? (
          <ul className="of-list">
            {keys.map((key) => (
              <li key={key.id} className="of-list__item">
                <div className="of-list__main">
                  <strong>{key.label}</strong>
                  <span className="of-muted">
                    {key.prefix}… · créée le {formatDate(key.createdAt)} · dernière utilisation :{" "}
                    {formatDate(key.lastUsedAt)}
                  </span>
                </div>
                <Button variant="danger" onClick={() => void revoke(key)}>
                  Révoquer
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="of-muted">Aucune clé pour l'instant.</p>
        )}
      </section>

      <section className="of-card of-form">
        <h2>Assistant du navigateur (WebMCP)</h2>
        {webMcp.status === "active" ? (
          <p>
            <span className="of-chip of-chip--green">Actif</span> {webMcp.tools} outils sont
            proposés à l'assistant IA de votre navigateur tant que l'admin est ouverte. Il agit avec
            votre session, et vous confirmez vous-même la publication et les suppressions.
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
