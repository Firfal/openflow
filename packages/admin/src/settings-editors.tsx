// The Puck-based settings editors (« Menu et pied de page », « Couleurs et polices »), loaded with the editor.
import "@puckeditor/core/no-external.css";
import {
  applyDefaults,
  buildPageCss,
  type OpenFlowConfig,
  prepareRenderConfig,
  sanitizeTheme,
  siteLocales,
  type ThemeConfig,
} from "@openflow/core";
import { type Config, type CustomField, type Data, type Fields, Puck } from "@puckeditor/core";
import { createElement, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useAutosave } from "./autosave.js";
import { ThemeStyles } from "./canvas.js";
import { useAdmin } from "./context.js";
import { getPage, saveSettings, saveSettingValues, saveTheme } from "./data.js";
import {
  EDITOR_IFRAME,
  EDITOR_VIEWPORTS,
  type EditorChrome,
  EditorChromeContext,
  editorUi,
  SETTINGS_EDITOR_OVERRIDES,
} from "./editor-ui.js";
import { mapFields } from "./fields.js";
import { FR_DICTIONARY } from "./i18n.js";
import { PageHead } from "./shell.js";
import { ColorControl } from "./style-controls.js";
import { CommonTranslation } from "./translate.js";
import { EmptyState } from "./ui.js";

const SETTINGS_UI = editorUi({ leftSideBarVisible: false });

/**
 * Settings about the look of the whole site (`config.settings.appearance`, a colour palette…): shown
 * in « Couleurs et polices » when the site has a theme, so its colours are set in one place.
 */
function appearanceKeys(config: OpenFlowConfig): string[] {
  return config.theme ? (config.settings?.appearance ?? []) : [];
}

function pick<T>(record: Record<string, T> | undefined, keys: string[]): Record<string, T> {
  return Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => keys.includes(key)));
}

function omit<T>(record: Record<string, T> | undefined, keys: string[]): Record<string, T> {
  return Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => !keys.includes(key)));
}

/** The right panel is titled after the view, not « Page » (Puck's name for the root fields). */
const MENU_DICTIONARY = { ...FR_DICTIONARY, "label-page": "Menu et pied de page" };
const THEME_DICTIONARY = { ...FR_DICTIONARY, "label-page": "Couleurs et polices" };

/** Global content (navigation, footer…) edited with Puck's root fields, with an optional preview. */
export function GlobalContent() {
  const { config, settings } = useAdmin();
  const main = settings?.site?.lang || config.site.lang || "fr";
  const others = siteLocales({ lang: main, locales: settings?.site?.locales });
  const [locale, setLocale] = useState(main);
  const key = others.join();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `others` is tracked through `key`.
  const languages = useMemo(() => ({ main, others }), [main, key]);
  if (locale !== main && others.includes(locale)) {
    return <CommonTranslation locale={locale} main={main} others={others} onLanguage={setLocale} />;
  }
  return <GlobalContentEditor languages={languages} onLanguage={setLocale} />;
}

function GlobalContentEditor({
  languages,
  onLanguage,
}: {
  languages: { main: string; others: string[] };
  onLanguage: (locale: string) => void;
}) {
  const { config, services, settings, user } = useAdmin();
  const site = settings?.site ?? config.site;
  const settingsConfig = config.settings;
  const Layout = config.layout;
  const appearance = useMemo(() => appearanceKeys(config), [config]);
  // The appearance values are edited in « Couleurs et polices »: saved as they are now.
  const latest = useRef(settings);
  latest.current = settings;
  const save = useCallback(
    (data: Data) =>
      saveSettings(
        services.db,
        {
          values: {
            ...pick(latest.current?.values, appearance),
            ...omit(data.root.props as Record<string, unknown>, appearance),
          },
        },
        user.email ?? undefined,
      ),
    [services.db, user.email, appearance],
  );
  const autosave = useAutosave(save);
  const { flush } = autosave;
  const chrome = useMemo<EditorChrome>(
    () => ({
      kind: "settings",
      title: "Menu et pied de page",
      saveState: autosave.state,
      saveError: autosave.error,
      retry: () => void flush(),
      ...(languages.others.length > 0
        ? {
            languages: { ...languages, current: languages.main },
            setLanguage: async (next: string) => {
              await flush();
              onLanguage(next);
            },
          }
        : {}),
    }),
    [autosave.state, autosave.error, flush, languages, onLanguage],
  );
  // The preview only depends on the site identity: keep the config stable across saves.
  const siteKey = JSON.stringify(site);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `site` is tracked through `siteKey`.
  const stableSite = useMemo(() => site, [siteKey]);
  const puckConfig = useMemo<Config>(
    () => ({
      components: {},
      root: {
        fields: mapFields(
          omit(settingsConfig?.fields as Record<string, unknown> | undefined, appearance) as Fields,
        ),
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
    [settingsConfig, stableSite, Layout, appearance],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: computed once, Puck owns the state afterwards.
  const data = useMemo<Data>(
    () => ({
      root: { props: { ...(settingsConfig?.defaultProps ?? {}), ...(settings?.values ?? {}) } },
      content: [],
    }),
    [],
  );
  if (!settingsConfig) {
    return (
      <>
        <PageHead title="Menu et pied de page" />
        <div className="of-view of-view--narrow">
          <EmptyState icon="panelTop" title="Pas de contenu commun">
            <p>Ce site ne déclare pas de contenu partagé entre les pages (menu, pied de page…).</p>
          </EmptyState>
        </div>
      </>
    );
  }
  return (
    <EditorChromeContext.Provider value={chrome}>
      <div className="of-editor of-editor--settings">
        <Puck
          config={puckConfig}
          data={data}
          onChange={autosave.schedule}
          dictionary={MENU_DICTIONARY}
          headerTitle="Menu et pied de page, communs à toutes les pages"
          height="100dvh"
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
function ThemePreview({
  values,
  appearance,
}: {
  values: Record<string, unknown>;
  appearance: Record<string, unknown>;
}) {
  const { config, settings, pages, services } = useAdmin();
  const renderConfig = useMemo(() => prepareRenderConfig(config), [config]);
  const pageId = (pages.find((p) => p.slug === "") ?? pages[0])?.id;
  // The list only holds the pages' metadata: the content of the previewed page is read once.
  const [data, setData] = useState<Data>();
  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    getPage(services.db, pageId).then(
      (page) => {
        if (!cancelled && page) setData(applyDefaults(page.data, config));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [pageId, services.db, config]);
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
          settings={{
            ...(config.settings?.defaultProps ?? {}),
            ...(settings?.values ?? {}),
            ...appearance,
          }}
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

/** « Couleurs et polices »: colours and fonts of the site (`config.theme`), with a live preview. */
export function ThemeEditor({ theme }: { theme: ThemeConfig }) {
  const { config, services, settings, user } = useAdmin();
  const appearance = useMemo(() => appearanceKeys(config), [config]);
  const save = useCallback(
    async (data: Data) => {
      const props = (data.root.props ?? {}) as Record<string, unknown>;
      await Promise.all([
        saveTheme(services.db, sanitizeTheme(props), user.email ?? undefined),
        saveSettingValues(services.db, pick(props, appearance), user.email ?? undefined),
      ]);
    },
    [services.db, user.email, appearance],
  );
  const autosave = useAutosave(save);
  const { flush } = autosave;
  const chrome = useMemo<EditorChrome>(
    () => ({
      kind: "settings",
      title: "Couleurs et polices",
      saveState: autosave.state,
      saveError: autosave.error,
      retry: () => void flush(),
    }),
    [autosave.state, autosave.error, flush],
  );
  const puckConfig = useMemo<Config>(
    () => ({
      components: {},
      root: {
        fields: {
          ...mapFields(
            pick(config.settings?.fields as Record<string, never>, appearance) as Fields,
          ),
          ...themeFields(theme),
        },
        render: ({ children: _children, puck: _puck, editMode: _editMode, ...values }: any) => (
          <ThemePreview values={values} appearance={pick(values, appearance)} />
        ),
      },
    }),
    [theme, config.settings, appearance],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: computed once, Puck owns the state afterwards.
  const data = useMemo<Data>(
    () => ({
      root: {
        props: {
          ...pick(
            { ...(config.settings?.defaultProps ?? {}), ...(settings?.values ?? {}) },
            appearance,
          ),
          ...settings?.theme,
        },
      },
      content: [],
    }),
    [],
  );
  return (
    <EditorChromeContext.Provider value={chrome}>
      <div className="of-editor of-editor--settings">
        <Puck
          config={puckConfig}
          data={data}
          onChange={autosave.schedule}
          dictionary={THEME_DICTIONARY}
          headerTitle="Couleurs et polices du site"
          height="100dvh"
          iframe={EDITOR_IFRAME}
          ui={SETTINGS_UI}
          viewports={EDITOR_VIEWPORTS}
          overrides={SETTINGS_EDITOR_OVERRIDES}
        />
      </div>
    </EditorChromeContext.Provider>
  );
}
