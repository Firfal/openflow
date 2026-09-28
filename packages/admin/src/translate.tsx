import {
  applyPageTranslation,
  collectTranslation,
  languageLabel,
  languageName,
  type PageTranslation,
  pageTexts,
  settingsTexts,
  type TranslatableText,
  textFingerprint,
} from "@openflow/core";
import { AutoField, createUsePuck } from "@puckeditor/core";
import { createContext, useContext, useId, useMemo, useState } from "react";
import { useAdmin } from "./context.js";
import { saveSettingsTranslation } from "./data.js";
import { errorMessage } from "./firebase.js";
import { PageHead } from "./shell.js";
import { Button, StatusChip } from "./ui.js";

/**
 * The translation editor: the page opens in another language (`?view=editor&page=…&lang=en`),
 * with its sections, images and styles locked (they belong to the default language). The owner
 * types the translations on the page or in the right panel, which shows each text of the
 * default language above its translation.
 */

export interface TranslationMeta {
  title: string;
  slug: string;
  description: string;
}

export interface TranslationState {
  locale: string;
  /** Default language of the site. */
  main: string;
  /** The page's texts in the default language. */
  source: TranslatableText[];
  /** The translation as it was when the editor opened. */
  previous: Pick<PageTranslation, "values" | "sources"> | undefined;
  /** Title, address and description in this language (saved with the texts). */
  meta: TranslationMeta;
  setMeta: (patch: Partial<TranslationMeta>) => void;
  /** The page in the default language (placeholders of the meta fields). */
  page: { title: string; slug: string; description?: string; home: boolean; item: boolean };
}

export const TranslationContext = createContext<TranslationState | null>(null);

export function useTranslation(): TranslationState | null {
  return useContext(TranslationContext);
}

const usePuck = createUsePuck();

const KIND_FIELDS = {
  text: { type: "text" },
  alt: { type: "text" },
  textarea: { type: "textarea" },
  richtext: { type: "richtext" },
} as const;

/** Visible text of a source (rich text without its tags). */
function plain(text: TranslatableText): string {
  return text.kind === "richtext"
    ? text.value
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : text.value;
}

/** How far the translation is: translated texts, and those whose source changed since. */
export function useTranslationProgress() {
  const translation = useTranslation();
  const { config } = useAdmin();
  const data = usePuck((s) => s.appState.data);
  return useMemo(() => {
    if (!translation) return undefined;
    const now = pageTexts(data, config);
    const { values } = collectTranslation(translation.source, now, translation.previous);
    const current = new Map(now.map((text) => [text.key, text.value]));
    let outdated = 0;
    for (const text of translation.source) {
      const before = translation.previous?.values?.[text.key];
      const fingerprint = translation.previous?.sources?.[text.key];
      if (
        before !== undefined &&
        current.get(text.key) === before &&
        fingerprint &&
        fingerprint !== textFingerprint(text.value)
      ) {
        outdated++;
      }
    }
    return {
      total: translation.source.length,
      translated: Object.keys(values).length,
      outdated,
      values,
      current,
    };
  }, [translation, data, config]);
}

function TextRow({
  text,
  value,
  translated,
  outdated,
  locale,
  main,
  onChange,
}: {
  text: TranslatableText;
  value: string;
  translated: boolean;
  outdated: boolean;
  locale: string;
  main: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <li className="of-translate__text">
      <div className="of-translate__head">
        <label htmlFor={id} className="of-translate__label">
          {text.label.split(" › ").slice(1).join(" › ") || text.label}
        </label>
        {outdated ? (
          <StatusChip tone="orange">À revoir</StatusChip>
        ) : !translated ? (
          <StatusChip tone="grey">À traduire</StatusChip>
        ) : null}
      </div>
      <p className="of-translate__source" lang={main}>
        {plain(text)}
      </p>
      <div lang={locale}>
        <AutoField
          field={KIND_FIELDS[text.kind] as never}
          id={id}
          value={value}
          onChange={(next: unknown) => onChange(typeof next === "string" ? next : "")}
        />
      </div>
    </li>
  );
}

/** Title, address and description of the page in this language. */
function MetaFields({ translation }: { translation: TranslationState }) {
  const titleId = useId();
  const slugId = useId();
  const descriptionId = useId();
  const { meta, setMeta, page, locale } = translation;
  return (
    <div className="of-translate__meta">
      <div className="of-field">
        <label htmlFor={titleId} className="of-field__label">
          Titre de la page
        </label>
        <input
          id={titleId}
          className="of-input"
          lang={locale}
          value={meta.title}
          placeholder={page.title}
          onChange={(e) => setMeta({ title: e.target.value })}
        />
      </div>
      {!page.home && !page.item && (
        <div className="of-field">
          <label htmlFor={slugId} className="of-field__label">
            Adresse
          </label>
          <div className="of-translate__slug">
            <span aria-hidden>/{locale}/</span>
            <input
              id={slugId}
              className="of-input of-mono of-translate__slug-input"
              value={meta.slug}
              placeholder={page.slug}
              spellCheck={false}
              onChange={(e) =>
                setMeta({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9/-]/g, "-") })
              }
            />
          </div>
        </div>
      )}
      <div className="of-field">
        <label htmlFor={descriptionId} className="of-field__label">
          Description pour Google et les IA
        </label>
        <textarea
          id={descriptionId}
          className="of-input"
          rows={3}
          lang={locale}
          value={meta.description}
          placeholder={page.description}
          onChange={(e) => setMeta({ description: e.target.value })}
        />
      </div>
    </div>
  );
}

/**
 * Right panel of the translation editor: the texts of the selected section (or of the whole page
 * with its title and description), each under its text in the default language.
 */
export function TranslationPanel() {
  const translation = useTranslation();
  const { config } = useAdmin();
  const selected = usePuck((s) => s.selectedItem);
  const dispatch = usePuck((s) => s.dispatch);
  const progress = useTranslationProgress();
  if (!translation || !progress) return null;
  const sectionId = selected?.props.id as string | undefined;
  const texts = sectionId
    ? translation.source.filter((text) => text.section === sectionId)
    : translation.source;
  const sectionLabel = selected
    ? (config.components[selected.type]?.label ?? selected.type)
    : undefined;
  const change = (key: string) => (value: string) =>
    dispatch({
      type: "setData",
      data: (previous) => applyPageTranslation(previous, config, { [key]: value }),
    });
  return (
    <div className="of-panel of-translate">
      <header className="of-translate__header">
        <p className="of-translate__lang">
          Traduction en {languageName(translation.locale)} ({languageLabel(translation.locale)})
        </p>
        <h2 className="of-translate__title">
          {sectionLabel ? `Section « ${sectionLabel} »` : "Toute la page"}
        </h2>
        <p className="of-card__lead">
          {progress.translated} texte{progress.translated > 1 ? "s" : ""} traduit
          {progress.translated > 1 ? "s" : ""} sur {progress.total}
          {progress.outdated > 0 ? ` · ${progress.outdated} à revoir` : ""}. Les sections, les
          images et le style suivent la version en {languageName(translation.main)}.
        </p>
      </header>
      {!selected && <MetaFields translation={translation} />}
      {texts.length === 0 ? (
        <p className="of-panel__hint">Cette section n'a pas de texte à traduire.</p>
      ) : (
        <ol className="of-translate__list">
          {texts.map((text) => (
            <TextRow
              key={text.key}
              text={text}
              value={progress.current.get(text.key) ?? text.value}
              translated={text.key in progress.values}
              outdated={
                translation.previous?.values?.[text.key] !== undefined &&
                progress.current.get(text.key) === translation.previous.values[text.key] &&
                Boolean(translation.previous.sources?.[text.key]) &&
                translation.previous.sources?.[text.key] !== textFingerprint(text.value)
              }
              locale={translation.locale}
              main={translation.main}
              onChange={change(text.key)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

/** The site's languages as a select (common content, dashboard views). */
export function LanguageSelect({
  main,
  others,
  current,
  onChange,
}: {
  main: string;
  others: string[];
  current: string;
  onChange: (locale: string) => void;
}) {
  return (
    <label className="of-lang">
      <span className="of-sr-only">Langue</span>
      <select
        className="of-lang__select"
        value={current}
        onChange={(event) => onChange(event.target.value)}
      >
        {[main, ...others].map((code) => (
          <option key={code} value={code}>
            {languageLabel(code)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * « Contenu commun » in another language: the site's name and description, then each text of the
 * menu and footer under its original.
 */
export function CommonTranslation({
  locale,
  main,
  others,
  onLanguage,
}: {
  locale: string;
  main: string;
  others: string[];
  onLanguage: (locale: string) => void;
}) {
  const { config, settings, services, user, notify } = useAdmin();
  const values = useMemo(
    () => ({ ...(config.settings?.defaultProps ?? {}), ...(settings?.values ?? {}) }),
    [config.settings?.defaultProps, settings?.values],
  );
  const source = useMemo(() => settingsTexts(values, config), [values, config]);
  const existing = settings?.translations?.[locale];
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    ...(existing?.values ?? {}),
  }));
  const [name, setName] = useState(existing?.site?.name ?? "");
  const [description, setDescription] = useState(existing?.site?.description ?? "");
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const descriptionId = useId();

  const save = async () => {
    setBusy(true);
    try {
      const edited = source.map((text) => ({ ...text, value: draft[text.key] ?? text.value }));
      const { values: translated, sources } = collectTranslation(source, edited, existing);
      for (const [key, value] of Object.entries(translated)) {
        if (!value.trim()) {
          delete translated[key];
          delete sources[key];
        }
      }
      await saveSettingsTranslation(
        services.db,
        locale,
        {
          ...(name.trim() || description.trim()
            ? {
                site: {
                  ...(name.trim() ? { name: name.trim() } : {}),
                  ...(description.trim() ? { description: description.trim() } : {}),
                },
              }
            : {}),
          values: translated,
          sources,
        },
        user.email ?? undefined,
      );
      notify("success", "Traduction enregistrée. Publiez pour la mettre en ligne.");
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="Contenu commun"
        description={`Menu, pied de page et nom du site en ${languageName(locale)}.`}
        actions={
          <LanguageSelect main={main} others={others} current={locale} onChange={onLanguage} />
        }
      />
      <div className="of-view of-view--narrow">
        <form
          className="of-card of-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="of-field">
            <label htmlFor={nameId} className="of-field__label">
              Nom du site
            </label>
            <p className="of-translate__source" lang={main}>
              {settings?.site?.name ?? config.site.name}
            </p>
            <input
              id={nameId}
              className="of-input"
              lang={locale}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="of-field">
            <label htmlFor={descriptionId} className="of-field__label">
              Description par défaut
            </label>
            {settings?.site?.description && (
              <p className="of-translate__source" lang={main}>
                {settings.site.description}
              </p>
            )}
            <textarea
              id={descriptionId}
              className="of-input"
              rows={2}
              lang={locale}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <ol className="of-translate__list">
            {source.map((text) => (
              <CommonText
                key={text.key}
                text={text}
                value={draft[text.key] ?? ""}
                locale={locale}
                main={main}
                onChange={(value) => setDraft((d) => ({ ...d, [text.key]: value }))}
              />
            ))}
          </ol>
          <div className="of-row of-form__actions">
            <Button variant="primary" type="submit" busy={busy}>
              Enregistrer la traduction
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

function CommonText({
  text,
  value,
  locale,
  main,
  onChange,
}: {
  text: TranslatableText;
  value: string;
  locale: string;
  main: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <li className="of-translate__text">
      <label htmlFor={id} className="of-translate__label">
        {text.label}
      </label>
      <p className="of-translate__source" lang={main}>
        {plain(text)}
      </p>
      {text.kind === "textarea" || text.kind === "richtext" ? (
        <textarea
          id={id}
          className="of-input"
          rows={2}
          lang={locale}
          value={value}
          placeholder={plain(text)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          className="of-input"
          lang={locale}
          value={value}
          placeholder={plain(text)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </li>
  );
}
