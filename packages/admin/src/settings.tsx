import {
  applyDefaults,
  buildPageCss,
  prepareRenderConfig,
  type SiteSettings,
  sanitizeTheme,
  type ThemeConfig,
} from "@openflow/core";
import { type Config, type CustomField, type Data, type Fields, Puck } from "@puckeditor/core";
import { createElement, useCallback, useId, useMemo, useState } from "react";
import { AssistantSettings } from "./assistant.js";
import { useAutosave } from "./autosave.js";
import { ThemeStyles } from "./canvas.js";
import { useAdmin } from "./context.js";
import { saveSettings, saveTheme } from "./data.js";
import {
  EDITOR_IFRAME,
  EDITOR_VIEWPORTS,
  type EditorChrome,
  EditorChromeContext,
  SETTINGS_EDITOR_OVERRIDES,
} from "./editor-ui.js";
import { mapFields } from "./fields.js";
import { errorMessage } from "./firebase.js";
import { FR_DICTIONARY } from "./i18n.js";
import { ColorControl } from "./style-controls.js";
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

const SETTINGS_UI = { leftSideBarVisible: false };

/** Global content (navigation, footer…) edited with Puck's root fields, with an optional preview. */
function GlobalContent() {
  const { config, services, settings, user } = useAdmin();
  const site = settings?.site ?? config.site;
  const settingsConfig = config.settings;
  const Layout = config.layout;
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
  const { flush } = autosave;
  const chrome = useMemo<EditorChrome>(
    () => ({ saveState: autosave.state, saveError: autosave.error, retry: () => void flush() }),
    [autosave.state, autosave.error, flush],
  );
  // The preview only depends on the site identity: keep the config stable across saves.
  const siteKey = JSON.stringify(site);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `site` is tracked through `siteKey`.
  const stableSite = useMemo(() => site, [siteKey]);
  const puckConfig = useMemo<Config>(
    () => ({
      components: {},
      root: {
        fields: mapFields(settingsConfig?.fields as Fields | undefined),
        defaultProps: settingsConfig?.defaultProps,
        render: ({ children: _children, puck: _puck, editMode: _editMode, ...values }: any) => {
          if (settingsConfig?.preview) {
            return settingsConfig.preview({ values, site: stableSite }) ?? <div />;
          }
          if (Layout) {
            return (
              <>
                <SettingsTheme />
                <Layout settings={values} site={stableSite} editing>
                  <div className="of-settings-placeholder">Contenu des pages</div>
                </Layout>
              </>
            );
          }
          return (
            <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", color: "#555" }}>
              Ces réglages s'appliquent à toutes les pages du site.
            </div>
          );
        },
      },
    }),
    [settingsConfig, stableSite, Layout],
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
    <EditorChromeContext.Provider value={chrome}>
      <div className="of-editor of-editor--settings">
        <Puck
          config={puckConfig}
          data={data}
          onChange={autosave.schedule}
          dictionary={FR_DICTIONARY}
          headerTitle="Contenu commun à toutes les pages"
          height="calc(100dvh - var(--of-topbar-height) - 56px)"
          iframe={EDITOR_IFRAME}
          ui={SETTINGS_UI}
          viewports={EDITOR_VIEWPORTS}
          overrides={SETTINGS_EDITOR_OVERRIDES}
        />
      </div>
    </EditorChromeContext.Provider>
  );
}

/** Theme of the saved settings, in previews (read from the context: the Puck config stays stable). */
function SettingsTheme() {
  const { settings } = useAdmin();
  return <ThemeStyles theme={settings?.theme} />;
}

const GENERIC_FONTS = [
  { label: "Police du système", value: "system-ui" },
  { label: "Sans empattement", value: "sans-serif" },
  { label: "Avec empattement", value: "serif" },
];

type ColorFieldRender = CustomField<string>["render"];

/** Colour token of the theme: picker, hex value, and the site's value as placeholder. */
function ThemeColorInput({
  label,
  value,
  siteValue,
  onChange,
}: {
  label: string;
  value: string | undefined;
  siteValue: string | undefined;
  onChange: (value: string) => void;
}) {
  // Puck renders the fields panel twice (desktop and mobile): ids must differ between copies.
  const id = useId();
  return (
    <div className="of-field of-theme-field">
      <label className="of-field__label" htmlFor={id}>
        {label}
      </label>
      <ColorControl
        id={id}
        value={value || undefined}
        placeholder={siteValue}
        swatches={[]}
        onChange={(next) => onChange(next ?? "")}
      />
    </div>
  );
}

const ThemeColorField: ColorFieldRender = ({ field, name, value, onChange }) => (
  <ThemeColorInput
    label={field.label ?? name}
    value={value}
    siteValue={field.metadata?.siteValue as string | undefined}
    onChange={onChange}
  />
);

function themeFields(theme: ThemeConfig): Fields {
  const fields: Record<string, unknown> = {};
  for (const token of theme.colors ?? []) {
    fields[`color-${token.token}`] = {
      type: "custom",
      label: token.label,
      metadata: { siteValue: token.value },
      render: ThemeColorField,
    };
  }
  const options = [...(theme.fontOptions ?? []), ...GENERIC_FONTS];
  for (const token of theme.fonts ?? []) {
    const current = options.find((o) => o.value === token.value)?.label ?? "police du site";
    fields[`font-${token.token}`] = {
      type: "select",
      label: token.label,
      options: [{ label: `Par défaut (${current})`, value: "" }, ...options],
    };
  }
  return fields as Fields;
}

/** Home page (or first page) of the site with the theme being edited: a live preview. */
function ThemePreview({ values }: { values: Record<string, unknown> }) {
  const { config, settings, pages } = useAdmin();
  const renderConfig = useMemo(() => prepareRenderConfig(config), [config]);
  const page = pages.find((p) => p.slug === "") ?? pages[0];
  const data = page ? applyDefaults(page.data, config) : undefined;
  const Layout = config.layout;
  const content = data ? (
    data.content.map((item) => {
      const component = renderConfig.components[item.type];
      if (!component) return null;
      return createElement(component.render as never, {
        key: item.props.id,
        ...item.props,
        puck: { isEditing: false, renderDropZone: () => null, metadata: {} },
      });
    })
  ) : (
    <div className="of-settings-placeholder">Contenu des pages</div>
  );
  const css = data ? buildPageCss(data) : "";
  return (
    <>
      <ThemeStyles theme={sanitizeTheme(values)} />
      {css && <style>{css}</style>}
      {Layout ? (
        <Layout
          settings={{ ...(config.settings?.defaultProps ?? {}), ...(settings?.values ?? {}) }}
          site={{ ...config.site, ...(settings?.site ?? {}) }}
        >
          {content}
        </Layout>
      ) : (
        content
      )}
    </>
  );
}

/** Réglages > Thème: colours and fonts of the site (`config.theme`), with a live preview. */
function ThemeEditor({ theme }: { theme: ThemeConfig }) {
  const { services, settings, user } = useAdmin();
  const save = useCallback(
    (data: Data) =>
      saveTheme(services.db, sanitizeTheme(data.root.props ?? {}), user.email ?? undefined),
    [services.db, user.email],
  );
  const autosave = useAutosave(save);
  const { flush } = autosave;
  const chrome = useMemo<EditorChrome>(
    () => ({ saveState: autosave.state, saveError: autosave.error, retry: () => void flush() }),
    [autosave.state, autosave.error, flush],
  );
  const puckConfig = useMemo<Config>(
    () => ({
      components: {},
      root: {
        fields: themeFields(theme),
        render: ({ children: _children, puck: _puck, editMode: _editMode, ...values }: any) => (
          <ThemePreview values={values} />
        ),
      },
    }),
    [theme],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: computed once, Puck owns the state afterwards.
  const data = useMemo<Data>(() => ({ root: { props: { ...settings?.theme } }, content: [] }), []);
  return (
    <EditorChromeContext.Provider value={chrome}>
      <div className="of-editor of-editor--settings">
        <Puck
          config={puckConfig}
          data={data}
          onChange={autosave.schedule}
          dictionary={FR_DICTIONARY}
          headerTitle="Thème : couleurs et polices du site"
          height="calc(100dvh - var(--of-topbar-height) - 56px)"
          iframe={EDITOR_IFRAME}
          ui={SETTINGS_UI}
          viewports={EDITOR_VIEWPORTS}
          overrides={SETTINGS_EDITOR_OVERRIDES}
        />
      </div>
    </EditorChromeContext.Provider>
  );
}

export function SettingsView() {
  const { config } = useAdmin();
  const [tab, setTab] = useState<"global" | "theme" | "site" | "assistant">("global");
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
        {config.theme && (
          <button
            type="button"
            className={tab === "theme" ? "is-active" : ""}
            onClick={() => setTab("theme")}
          >
            Thème
          </button>
        )}
        <button
          type="button"
          className={tab === "site" ? "is-active" : ""}
          onClick={() => setTab("site")}
        >
          Site et référencement
        </button>
        <button
          type="button"
          className={tab === "assistant" ? "is-active" : ""}
          onClick={() => setTab("assistant")}
        >
          Assistant IA
        </button>
      </nav>
      {tab === "global" ? (
        <GlobalContent />
      ) : tab === "theme" && config.theme ? (
        <ThemeEditor theme={config.theme} />
      ) : tab === "assistant" ? (
        <div className="of-view">
          <AssistantSettings />
        </div>
      ) : (
        <div className="of-view">
          <SiteForm />
        </div>
      )}
    </section>
  );
}
