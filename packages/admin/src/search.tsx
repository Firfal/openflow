import { FUNCTION_NAMES, type SearchStatsResult } from "@openflow/core";
import { useEffect, useState } from "react";
import { CopyField } from "./assistant.js";
import { useAdmin } from "./context.js";
import { call, errorMessage } from "./firebase.js";
import { Icon } from "./icons.js";
import { Button, Spinner } from "./ui.js";

const number = (value: number) => value.toLocaleString("fr-FR");
const day = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

/** The Search Console period closest to the statistics' one (7, 28 or 90 days). */
const periodOf = (days: number) => (days <= 7 ? 7 : days <= 30 ? 28 : 90);

/**
 * « Recherche Google » in Statistiques: what Google Search Console knows of the site (clicks,
 * impressions, position, queries, pages), read by `cmsSearchStats`; until the site is linked, how
 * to link it (verification tag, then the site's service account added as a user).
 */
export function SearchConsoleCard({ days }: { days: number }) {
  const { services, navigate, settings } = useAdmin();
  const period = periodOf(days);
  const [result, setResult] = useState<SearchStatsResult>();

  useEffect(() => {
    let cancelled = false;
    setResult(undefined);
    call<{ days: number }, SearchStatsResult>(services, FUNCTION_NAMES.searchStats, {
      days: period,
    }).then(
      (value) => !cancelled && setResult(value),
      (error) => !cancelled && setResult({ status: "error", message: errorMessage(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [services, period]);

  const verified = Boolean(settings?.site?.verification?.google);
  return (
    <section className="of-card of-gsc" aria-labelledby="of-search-title">
      <h2 id="of-search-title">Recherche Google</h2>
      {!result ? (
        <Spinner inline label="Lecture de Search Console…" />
      ) : result.status === "ok" ? (
        <>
          <p className="of-card__lead">
            Recherches Google qui ont montré le site, du {day(result.stats.from)} au{" "}
            {day(result.stats.to)} (Google les donne avec deux jours de retard).
          </p>
          <div className="of-stats__tiles">
            <div className="of-stat">
              <span className="of-stat__label">Clics</span>
              <span className="of-stat__value">{number(result.stats.clicks)}</span>
            </div>
            <div className="of-stat">
              <span className="of-stat__label">Affichages</span>
              <span className="of-stat__value">{number(result.stats.impressions)}</span>
            </div>
            <div className="of-stat">
              <span className="of-stat__label">Taux de clic</span>
              <span className="of-stat__value">
                {(result.stats.ctr * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
                {" "}%
              </span>
            </div>
            <div className="of-stat">
              <span className="of-stat__label">Position moyenne</span>
              <span className="of-stat__value">
                {result.stats.position.toLocaleString("fr-FR")}
              </span>
            </div>
          </div>
          <div className="of-grid-2">
            <div>
              <h3>Recherches</h3>
              {result.stats.queries.length > 0 ? (
                <ol className="of-rank" aria-label="Recherches Google">
                  {result.stats.queries.map((row) => (
                    <li key={row.query} className="of-rank__row">
                      <span className="of-rank__label" title={row.query}>
                        {row.query}
                      </span>
                      <span className="of-rank__value">
                        {number(row.clicks)}
                        <span className="of-rank__share">
                          position {row.position.toLocaleString("fr-FR")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="of-subtle">Pas encore assez de recherches pour les détailler.</p>
              )}
            </div>
            <div>
              <h3>Pages</h3>
              <ol className="of-rank" aria-label="Pages trouvées sur Google">
                {result.stats.pages.map((row) => (
                  <li key={row.page} className="of-rank__row">
                    <span className="of-rank__label of-mono" title={row.page}>
                      {row.page}
                    </span>
                    <span className="of-rank__value">
                      {number(row.clicks)}
                      <span className="of-rank__share">{number(row.impressions)} affichages</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <a
            className="of-link of-gsc__open"
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir Search Console
          </a>
        </>
      ) : result.status === "no-url" ? (
        <div className="of-gsc__todo">
          <p className="of-card__lead">
            Pour relier Search Console, renseignez d'abord l'adresse du site.
          </p>
          <Button onClick={() => navigate({ view: "settings", tab: "site" })}>
            Renseigner l'adresse
          </Button>
        </div>
      ) : result.status === "not-connected" ? (
        <div className="of-gsc__todo">
          <p className="of-card__lead">
            Voyez ici les recherches qui montrent votre site sur Google, sans quitter l'admin. À
            faire une fois :
          </p>
          <ol className="of-steps">
            <li>
              Dans{" "}
              <a
                className="of-link"
                href="https://search.google.com/search-console"
                target="_blank"
                rel="noreferrer"
              >
                Google Search Console
              </a>
              , ajoutez votre site (« Préfixe d'URL », avec son adresse). Pour la validation,
              choisissez « Balise HTML », collez-la dans Réglages &gt; Site et référencement,
              publiez, puis cliquez sur « Valider ».{" "}
              {verified ? (
                "Votre balise est déjà enregistrée."
              ) : (
                <Button size="sm" onClick={() => navigate({ view: "settings", tab: "site" })}>
                  Coller la balise
                </Button>
              )}
            </li>
            <li>
              Dans Search Console, ouvrez « Paramètres &gt; Utilisateurs et autorisations » et
              ajoutez cet utilisateur, avec l'autorisation « Restreint » :
              {result.serviceAccount ? (
                <CopyField label="Compte du site" value={result.serviceAccount} />
              ) : (
                <span className="of-subtle">
                  {" "}
                  le compte de service du site, affiché ici une fois le site en ligne.
                </span>
              )}
            </li>
            <li>Revenez ici : les recherches s'affichent, avec deux jours de retard.</li>
          </ol>
        </div>
      ) : (
        <p className="of-callout of-callout--warning">
          <Icon name="circleAlert" className="of-icon--first-line" />
          <span>Search Console n'a pas répondu : {result.message}</span>
        </p>
      )}
    </section>
  );
}
