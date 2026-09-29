import {
  LANGUAGES,
  MAX_LOCALES,
  type SiteSettings,
  sanitizeVerification,
  siteLocales,
  verificationCode,
} from "@openflow/core";
import { lazy, Suspense, useState } from "react";
import { BusinessForm } from "./business.js";
import { type SettingsTab, useAdmin } from "./context.js";
import { saveLanguages, saveSettings } from "./data.js";
import { errorMessage } from "./firebase.js";
import { UnsavedNote, useUnsavedGuard } from "./form-guard.js";
import { LegalForm } from "./legal.js";
import { PageHead } from "./shell.js";
import { Button, FormField, Spinner } from "./ui.js";

// « Menu et pied de page » and « Couleurs et polices » use the visual editor (Puck): loaded when opened.
const GlobalContent = lazy(() =>
  import("./settings-editors.js").then((m) => ({ default: m.GlobalContent })),
);
const ThemeEditor = lazy(() =>
  import("./settings-editors.js").then((m) => ({ default: m.ThemeEditor })),
);

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
  const { config, services, settings, user, notify, navigate } = useAdmin();
  const initial: SiteSettings = {
    name: config.site.name,
    lang: config.site.lang ?? "fr",
    url: config.site.url,
    description: config.site.description,
    ...settings?.site,
  };
  const [site, setSite] = useState<SiteSettings>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(site) !== saved;
  const urlError =
    site.url && !/^https?:\/\/[^\s]+$/.test(site.url)
      ? "Adresse complète attendue, ex. https://www.monsite.fr"
      : undefined;
  const googleError =
    site.verification?.google && !verificationCode(site.verification.google)
      ? "Collez le code de validation donné par Search Console (ou la balise entière)."
      : undefined;
  const bingError =
    site.verification?.bing && !verificationCode(site.verification.bing)
      ? "Collez le code de validation donné par Bing (ou la balise entière)."
      : undefined;
  const gaId = site.gaMeasurementId?.trim().toUpperCase() ?? "";
  const gaError =
    gaId && !/^G-[A-Z0-9]{4,20}$/.test(gaId)
      ? "Identifiant de mesure attendu, ex. G-AB12CD34EF (Google Analytics 4)."
      : undefined;

  const invalid = Boolean(urlError || gaError || googleError || bingError);
  const guard = useUnsavedGuard(dirty && !busy, () => {
    if (!invalid && !busy) void submit();
  });

  const submit = async () => {
    setBusy(true);
    try {
      await saveSettings(
        services.db,
        {
          site: {
            ...site,
            url: site.url || undefined,
            gaMeasurementId: gaId || undefined,
            locales: siteLocales(site),
            // Only the codes of the tags are kept.
            verification: sanitizeVerification(site.verification),
          },
        },
        user.email ?? undefined,
      );
      setSaved(JSON.stringify(site));
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
      <div>
        <h2>Identité du site</h2>
        <p className="of-card__lead">
          Utilisée par Google, les partages sur les réseaux sociaux et l'onglet du navigateur. Les
          résultats de Google (recherches, clics) sont dans{" "}
          <button
            type="button"
            className="of-link-btn of-link-btn--inline"
            onClick={() => navigate({ view: "stats" })}
          >
            Statistiques
          </button>
          .
        </p>
      </div>
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
      <div>
        <h2>Mesure d'audience</h2>
        <p className="of-card__lead">
          Les statistiques comptent les visites sans cookie ni bandeau (menu Statistiques). Google
          Analytics est facultatif : il affiche un bandeau, et ne mesure qu'après l'accord du
          visiteur.
        </p>
      </div>
      <div className="of-choices">
        <label className="of-checkbox">
          <input
            type="checkbox"
            checked={site.stats !== "off"}
            onChange={(e) => setSite({ ...site, stats: e.target.checked ? undefined : "off" })}
          />
          <span>
            Mesurer les visites sans cookie
            <span className="of-field__hint">
              Pages lues, sources des visites (moteurs de recherche, réseaux, moteurs IA),
              appareils. Aucune donnée personnelle.
            </span>
          </span>
        </label>
      </div>
      <FormField
        label="Identifiant Google Analytics"
        error={gaError}
        hint="Dans Google Analytics : Administration > Flux de données > votre site, « ID de mesure ». Laissez vide si les statistiques vous suffisent."
      >
        <input
          className="of-input of-mono"
          value={site.gaMeasurementId ?? ""}
          placeholder="G-XXXXXXXXXX"
          spellCheck={false}
          autoCapitalize="characters"
          onChange={(e) => setSite({ ...site, gaMeasurementId: e.target.value })}
        />
      </FormField>
      <FormField
        label="Validation Google Search Console"
        error={googleError}
        hint="Dans Search Console : ajoutez le site (« Préfixe d'URL »), choisissez la validation par « Balise HTML » et collez-la ici. Publiez, puis cliquez sur « Valider » dans Search Console."
      >
        <input
          className="of-input of-mono"
          value={site.verification?.google ?? ""}
          placeholder='<meta name="google-site-verification" content="…" />'
          spellCheck={false}
          onChange={(e) =>
            setSite({ ...site, verification: { ...site.verification, google: e.target.value } })
          }
        />
      </FormField>
      <FormField
        label="Validation Bing Webmaster Tools (facultatif)"
        error={bingError}
        hint="Bing alimente aussi Copilot et DuckDuckGo. Il peut importer le site depuis Search Console ; sinon, collez ici sa balise."
      >
        <input
          className="of-input of-mono"
          value={site.verification?.bing ?? ""}
          placeholder='<meta name="msvalidate.01" content="…" />'
          spellCheck={false}
          onChange={(e) =>
            setSite({ ...site, verification: { ...site.verification, bing: e.target.value } })
          }
        />
      </FormField>
      <div>
        <h2>Robots des IA</h2>
        <p className="of-card__lead">
          Les moteurs IA (ChatGPT, Claude, Perplexity, Copilot…) lisent votre site pour répondre et
          vous citer : ils restent toujours autorisés. Vous pouvez en revanche refuser que vos
          textes servent à entraîner des modèles d'IA.
        </p>
      </div>
      <fieldset className="of-choices">
        <legend className="of-sr-only">Entraînement des IA</legend>
        <label className="of-checkbox">
          <input
            type="radio"
            name="ai-training"
            checked={site.aiTraining !== "block"}
            onChange={() => setSite({ ...site, aiTraining: undefined })}
          />
          Autoriser l'entraînement des IA sur mes textes
        </label>
        <label className="of-checkbox">
          <input
            type="radio"
            name="ai-training"
            checked={site.aiTraining === "block"}
            onChange={() => setSite({ ...site, aiTraining: "block" })}
          />
          <span>
            Refuser l'entraînement des IA
            <span className="of-field__hint">
              GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot… sont refusés ; le site
              reste visible dans les recherches des moteurs IA.
            </span>
          </span>
        </label>
      </fieldset>
      <div className="of-row of-form__actions">
        <UnsavedNote dirty={dirty && !busy} />
        <Button variant="primary" type="submit" busy={busy} disabled={invalid}>
          Enregistrer
        </Button>
      </div>
      {guard}
    </form>
  );
}

/** « Langues »: the main language of the site and its other languages (each at /<lang>/). */
function LanguagesForm() {
  const { config, services, settings, user, notify, navigate } = useAdmin();
  const [lang, setLang] = useState(settings?.site?.lang ?? config.site.lang ?? "fr");
  const [locales, setLocales] = useState(() =>
    siteLocales({ lang, locales: settings?.site?.locales }),
  );
  const [busy, setBusy] = useState(false);
  const others = siteLocales({ lang, locales });
  const current = JSON.stringify({ lang, others });
  const [saved, setSaved] = useState(current);
  const dirty = current !== saved;
  const guard = useUnsavedGuard(dirty && !busy, () => {
    if (!busy) void submit();
  });

  const submit = async () => {
    setBusy(true);
    try {
      await saveLanguages(services.db, lang, others, user.email ?? undefined);
      setSaved(current);
      notify("success", "Langues enregistrées. Publiez pour les mettre en ligne.");
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
      <FormField label="Langue principale">
        <select className="of-input" value={lang} onChange={(e) => setLang(e.target.value)}>
          {LANGS.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </FormField>
      <fieldset className="of-choices">
        <legend className="of-field__label">Autres langues du site</legend>
        <p className="of-field__hint">
          Chaque langue a ses pages à part (/en/, /de/…), avec les mêmes sections et images. Vous
          traduisez les textes dans l'éditeur, en choisissant la langue en haut, ou votre IA les
          traduit pour vous. Une page non traduite n'existe que dans la langue principale.
        </p>
        {LANGUAGES.filter((language) => language.code !== lang).map((language) => {
          const checked = others.includes(language.code);
          return (
            <label key={language.code} className="of-checkbox">
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && others.length >= MAX_LOCALES}
                onChange={(e) =>
                  setLocales(
                    e.target.checked
                      ? [...others, language.code]
                      : others.filter((code) => code !== language.code),
                  )
                }
              />
              <span lang={language.code}>{language.label}</span>
            </label>
          );
        })}
      </fieldset>
      {others.length > 0 && (
        <p className="of-field__hint">
          Les pages se traduisent depuis la liste des{" "}
          <button
            type="button"
            className="of-link-btn of-link-btn--inline"
            onClick={() => navigate({ view: "pages" })}
          >
            Pages
          </button>{" "}
          (un bouton par langue sur chaque page) ; le menu et le pied de page, dans « Menu et pied
          de page ».
        </p>
      )}
      <div className="of-row of-form__actions">
        <UnsavedNote dirty={dirty && !busy} />
        <Button variant="primary" type="submit" busy={busy}>
          Enregistrer
        </Button>
      </div>
      {guard}
    </form>
  );
}

/** Titles of the settings views: the words of the sidebar (`nav.ts`). */
export const TAB_TITLES: Record<SettingsTab, string> = {
  global: "Menu et pied de page",
  theme: "Couleurs et polices",
  site: "Site et référencement",
  business: "Établissement",
  legal: "Informations légales",
  languages: "Langues",
};

/** The settings views, one per entry of the sidebar's « Réglages » group (the tab is in the address). */
export function SettingsView({ tab }: { tab: SettingsTab }) {
  const { config } = useAdmin();
  if (tab === "business") {
    return (
      <>
        <PageHead
          title={TAB_TITLES[tab]}
          description="Coordonnées, adresse et horaires, lus par Google et les moteurs IA."
        />
        <div className="of-view of-view--narrow">
          <BusinessForm />
        </div>
      </>
    );
  }
  if (tab === "legal") {
    return (
      <>
        <PageHead
          title={TAB_TITLES[tab]}
          description="Mentions légales et politique de confidentialité, écrites d'après votre site."
        />
        <div className="of-view of-view--narrow">
          <LegalForm />
        </div>
      </>
    );
  }
  if (tab === "site") {
    return (
      <>
        <PageHead
          title={TAB_TITLES[tab]}
          description="Nom et adresse du site, mesure d'audience, Google et les robots des IA."
        />
        <div className="of-view of-view--narrow">
          <SiteForm />
        </div>
      </>
    );
  }
  if (tab === "languages") {
    return (
      <>
        <PageHead
          title={TAB_TITLES[tab]}
          description="La langue principale du site et ses autres langues, chacune à sa propre adresse."
        />
        <div className="of-view of-view--narrow">
          <LanguagesForm />
        </div>
      </>
    );
  }
  return (
    <Suspense fallback={<Spinner label="Ouverture de l'éditeur…" />}>
      {tab === "theme" && config.theme ? <ThemeEditor theme={config.theme} /> : <GlobalContent />}
    </Suspense>
  );
}
