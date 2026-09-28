import type { SiteSettings } from "@openflow/core";
import { lazy, Suspense, useState } from "react";
import { BusinessForm } from "./business.js";
import { type SettingsTab, useAdmin } from "./context.js";
import { saveSettings } from "./data.js";
import { errorMessage } from "./firebase.js";
import { LegalForm } from "./legal.js";
import { PageHead } from "./shell.js";
import { Button, FormField, Spinner } from "./ui.js";

// « Contenu commun » and « Thème » use the visual editor (Puck): loaded when opened.
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
  const gaId = site.gaMeasurementId?.trim().toUpperCase() ?? "";
  const gaError =
    gaId && !/^G-[A-Z0-9]{4,20}$/.test(gaId)
      ? "Identifiant de mesure attendu, ex. G-AB12CD34EF (Google Analytics 4)."
      : undefined;

  const submit = async () => {
    setBusy(true);
    try {
      await saveSettings(
        services.db,
        { site: { ...site, url: site.url || undefined, gaMeasurementId: gaId || undefined } },
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
      <div>
        <h2>Identité du site</h2>
        <p className="of-card__lead">
          Utilisée par Google, les partages sur les réseaux sociaux et l'onglet du navigateur.
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
              Pages lues, sources des visites (moteurs, réseaux, assistants IA), appareils. Aucune
              donnée personnelle.
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
      <div>
        <h2>Robots des IA</h2>
        <p className="of-card__lead">
          Les assistants IA (ChatGPT, Claude, Perplexity, Copilot…) lisent votre site pour répondre
          et vous citer : ils restent toujours autorisés. Vous pouvez en revanche refuser que vos
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
              GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot… sont refusés dans
              robots.txt ; le site reste visible dans les recherches IA.
            </span>
          </span>
        </label>
      </fieldset>
      <div className="of-row">
        <Button variant="primary" type="submit" busy={busy} disabled={Boolean(urlError || gaError)}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

const TAB_TITLES: Record<SettingsTab, string> = {
  global: "Contenu commun",
  theme: "Thème",
  site: "Site et référencement",
  business: "Établissement",
  legal: "Informations légales",
};

/** Réglages: one view per tab of the sidebar (the tab lives in the address). */
export function SettingsView({ tab }: { tab: SettingsTab }) {
  const { config } = useAdmin();
  if (tab === "business") {
    return (
      <>
        <PageHead
          title={TAB_TITLES[tab]}
          description="Coordonnées, adresse et horaires, lus par Google et les assistants IA."
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
        <PageHead title={TAB_TITLES[tab]} />
        <div className="of-view of-view--narrow">
          <SiteForm />
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
