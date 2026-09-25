import type { SiteSettings } from "@openflow/core";
import { type Config, type Data, type Fields, Puck } from "@puckeditor/core";
import { useCallback, useMemo, useState } from "react";
import { useAutosave } from "./autosave.js";
import { useAdmin } from "./context.js";
import { saveSettings } from "./data.js";
import { SaveIndicator } from "./editor.js";
import { mapFields } from "./fields.js";
import { errorMessage } from "./firebase.js";
import { FR_DICTIONARY } from "./i18n.js";
import { Button, FormField } from "./ui.js";

const LANGS = [
  ["fr", "Français"],
  ["en", "English"],
  ["es", "Español"],
  ["de", "Deutsch"],
  ["it", "Italiano"],
  ["pt", "Português"],
  ["nl", "Nederlands"],
] as const;

function SiteForm() {
  const { config, services, settings, user, notify } = useAdmin();
  const initial: SiteSettings = {
    name: config.site.name,
    lang: config.site.lang ?? "fr",
    url: config.site.url,
    description: config.site.description,
    ...settings?.site,
  };
  const [site, setSite] = useState<SiteSettings>(initial);
  const [busy, setBusy] = useState(false);
  const urlError =
    site.url && !/^https?:\/\/[^\s]+$/.test(site.url)
      ? "Adresse complète attendue, ex. https://www.monsite.fr"
      : undefined;

  const submit = async () => {
    setBusy(true);
    try {
      await saveSettings(
        services.db,
        { site: { ...site, url: site.url || undefined } },
        user.email ?? undefined,
      );
      notify("success", "Réglages du site enregistrés. Publiez pour les mettre en ligne.");
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="of-card of-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2>Site et référencement</h2>
      <FormField label="Nom du site">
        <input
          className="of-input"
          required
          value={site.name}
          onChange={(e) => setSite({ ...site, name: e.target.value })}
        />
      </FormField>
      <FormField
        label="Adresse du site"
        error={urlError}
        hint="Utilisée pour Google et les partages sur les réseaux sociaux."
      >
        <input
          className="of-input"
          type="url"
          value={site.url ?? ""}
          placeholder="https://www.monsite.fr"
          onChange={(e) => setSite({ ...site, url: e.target.value })}
        />
      </FormField>
      <FormField
        label="Description par défaut"
        hint="Affichée par Google quand une page n'a pas sa propre description."
      >
        <textarea
          className="of-input"
          rows={3}
          value={site.description ?? ""}
          onChange={(e) => setSite({ ...site, description: e.target.value })}
        />
      </FormField>
      <FormField label="Langue du site">
        <select
          className="of-input"
          value={site.lang}
          onChange={(e) => setSite({ ...site, lang: e.target.value })}
        >
          {LANGS.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </FormField>
      <div className="of-row">
        <Button variant="primary" type="submit" busy={busy} disabled={Boolean(urlError)}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

/** Global content (navigation, footer…) edited with Puck's root fields, with an optional preview. */
function GlobalContent() {
  const { config, services, settings, user } = useAdmin();
  const site = settings?.site ?? config.site;
  const settingsConfig = config.settings;
  const save = useCallback(
    (data: Data) =>
      saveSettings(
        services.db,
        { values: (data.root.props ?? {}) as Record<string, unknown> },
        user.email ?? undefined,
      ),
    [services.db, user.email],
  );
  const autosave = useAutosave(save);
  const puckConfig = useMemo<Config>(
    () => ({
      components: {},
      root: {
        fields: mapFields(settingsConfig?.fields as Fields | undefined),
        defaultProps: settingsConfig?.defaultProps,
        render: ({ children: _children, puck: _puck, editMode: _editMode, ...values }: any) =>
          settingsConfig?.preview ? (
            (settingsConfig.preview({ values, site }) ?? <div />)
          ) : (
            <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", color: "#555" }}>
              Ces réglages s'appliquent à toutes les pages du site.
            </div>
          ),
      },
    }),
    [settingsConfig, site],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: computed once, Puck owns the state afterwards.
  const data = useMemo<Data>(
    () => ({
      root: { props: { ...(settingsConfig?.defaultProps ?? {}), ...(settings?.values ?? {}) } },
      content: [],
    }),
    [],
  );
  if (!settingsConfig) return <p className="of-muted">Ce site n'a pas de contenu global.</p>;
  return (
    <div className="of-editor of-editor--settings">
      <Puck
        config={puckConfig}
        data={data}
        onChange={autosave.schedule}
        dictionary={FR_DICTIONARY}
        headerTitle="Contenu commun à toutes les pages"
        height="calc(100dvh - var(--of-topbar-height) - 56px)"
        ui={{ leftSideBarVisible: false }}
        overrides={{
          headerActions: () => (
            <SaveIndicator
              state={autosave.state}
              error={autosave.error}
              onRetry={() => void autosave.flush()}
            />
          ),
        }}
      />
    </div>
  );
}

export function SettingsView() {
  const [tab, setTab] = useState<"global" | "site">("global");
  return (
    <section className="of-view of-view--flush">
      <nav className="of-tabs" aria-label="Réglages">
        <button
          type="button"
          className={tab === "global" ? "is-active" : ""}
          onClick={() => setTab("global")}
        >
          Contenu commun (menu, pied de page…)
        </button>
        <button
          type="button"
          className={tab === "site" ? "is-active" : ""}
          onClick={() => setTab("site")}
        >
          Site et référencement
        </button>
      </nav>
      {tab === "global" ? (
        <GlobalContent />
      ) : (
        <div className="of-view">
          <SiteForm />
        </div>
      )}
    </section>
  );
}
