import {
  addDays,
  COLLECTIONS,
  type Ranked,
  STATS_GROUPS,
  STATS_OPT_OUT_KEY,
  type StatsDoc,
  type StatsGroup,
  type StatsSummary,
  slugToPath,
  statsDay,
  statsPeriod,
  summarizeStats,
  VITALS,
  type VitalRating,
} from "@openflow/core";
import { collection, getDocs, query, where } from "firebase/firestore";
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from "react";
import { useAdmin } from "./context.js";
import { errorMessage } from "./firebase.js";
import { PageHead } from "./shell.js";
import { Button, EmptyState, Spinner, StatusChip, type Tone } from "./ui.js";

/**
 * « Statistiques »: the visits of the published site, measured without cookies (`cmsPageView`,
 * `cms_stats`). The last 90 days are read once; the period filter works on them.
 */

const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
] as const;

const number = (value: number) => value.toLocaleString("fr-FR");
const percent = (part: number, total: number) =>
  total > 0 ? `${Math.round((part / total) * 100)} %` : "0 %";

const DAY_LONG = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const DAY_SHORT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

function readOptOut(): boolean {
  try {
    return window.localStorage.getItem(STATS_OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOptOut(value: boolean) {
  try {
    if (value) window.localStorage.setItem(STATS_OPT_OUT_KEY, "1");
    else window.localStorage.removeItem(STATS_OPT_OUT_KEY);
  } catch {
    // Blocked storage: nothing to remember.
  }
}

interface Column {
  key: string;
  /** Tooltip heading: « lundi 21 septembre » or « semaine du 15 septembre ». */
  title: string;
  /** Axis label. */
  short: string;
  visits: number;
  views: number;
  ai: number;
}

/** Days for 7 and 30 days; weeks for 90 days (13 readable columns, even on a phone). */
function columnsOf(summary: StatsSummary, weekly: boolean): Column[] {
  if (!weekly) {
    return summary.days.map((d) => ({
      key: d.day,
      title: DAY_LONG.format(asDate(d.day)),
      short: DAY_SHORT.format(asDate(d.day)),
      visits: d.visits,
      views: d.views,
      ai: d.ai,
    }));
  }
  const columns: Column[] = [];
  // Weeks end on the last day of the period, so the last column is complete.
  for (let end = summary.days.length; end > 0; end -= 7) {
    const days = summary.days.slice(Math.max(0, end - 7), end);
    const first = days[0]!.day;
    columns.unshift({
      key: first,
      title: `Semaine du ${DAY_SHORT.format(asDate(first))}`,
      short: DAY_SHORT.format(asDate(first)),
      visits: days.reduce((sum, d) => sum + d.visits, 0),
      views: days.reduce((sum, d) => sum + d.views, 0),
      ai: days.reduce((sum, d) => sum + d.ai, 0),
    });
  }
  return columns;
}

/** Clean top of the axis (1, 2, 5, 10, 20, 50…) and its middle tick. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value) ?? 10;
  return step * power;
}

/**
 * Visits per day (or week): one series in the accent, columns ≤ 24 px with a 4 px rounded top,
 * hairline grid. Hover, focus and the arrow keys show the day's figures; the table below gives
 * every value without the pointer.
 */
function VisitsChart({ columns, weekly }: { columns: Column[]; weekly: boolean }) {
  const [active, setActive] = useState<number>();
  const [table, setTable] = useState(false);
  const tableId = useId();
  const max = niceMax(Math.max(0, ...columns.map((c) => c.visits)));
  const shown = active !== undefined ? columns[active] : undefined;
  const title = weekly ? "Visites par semaine" : "Visites par jour";
  // Axis labels: first, middle and last column only.
  const labelled = new Set([0, Math.floor((columns.length - 1) / 2), columns.length - 1]);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : columns.length - 1);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const from = active ?? (event.key === "ArrowLeft" ? columns.length : -1);
    const next = Math.min(
      columns.length - 1,
      Math.max(0, from + (event.key === "ArrowLeft" ? -1 : 1)),
    );
    setActive(next);
  };
  return (
    <div className="of-card of-chart">
      <div className="of-card__header">
        <h2>{title}</h2>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={table}
          aria-controls={tableId}
          onClick={() => setTable(!table)}
        >
          {table ? "Masquer le tableau" : "Voir le tableau"}
        </Button>
      </div>
      {/* The plot is a slider over the days: arrow keys, Home and End read each column. */}
      <div
        className="of-chart__plot"
        tabIndex={0}
        role="slider"
        aria-label={title}
        aria-valuemin={1}
        aria-valuemax={columns.length}
        aria-valuenow={(active ?? columns.length - 1) + 1}
        aria-valuetext={describe(columns[active ?? columns.length - 1])}
        onKeyDown={onKey}
        onFocus={() => setActive((current) => current ?? columns.length - 1)}
        onBlur={() => setActive(undefined)}
        onPointerLeave={(event) => {
          if (document.activeElement !== event.currentTarget) setActive(undefined);
        }}
      >
        <div className="of-chart__grid" aria-hidden>
          {[max, max / 2, 0].map((tick) => (
            <span key={tick}>
              <span className="of-chart__tick">{number(tick)}</span>
            </span>
          ))}
        </div>
        <div
          className="of-chart__columns"
          style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
        >
          {columns.map((column, index) => (
            <div
              key={column.key}
              className={`of-chart__column${active === index ? " is-active" : ""}`}
              onPointerEnter={() => setActive(index)}
              aria-hidden
            >
              {column.visits > 0 && (
                <span
                  className="of-chart__bar"
                  style={{ height: `${(column.visits / max) * 100}%` }}
                />
              )}
            </div>
          ))}
        </div>
        {shown && active !== undefined && (
          <div
            className="of-chart__tooltip"
            style={{
              left: `${((active + 0.5) / columns.length) * 100}%`,
              transform: `translateX(${active < columns.length / 3 ? "-10%" : active > (columns.length * 2) / 3 ? "-90%" : "-50%"})`,
            }}
          >
            <strong>
              {number(shown.visits)} visite{shown.visits > 1 ? "s" : ""}
            </strong>
            <span>{shown.title}</span>
            <span>
              {number(shown.ai)} depuis un assistant IA · {number(shown.views)} page
              {shown.views > 1 ? "s" : ""} vue{shown.views > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
      <div className="of-chart__axis" aria-hidden>
        {[...labelled].map((index) => (
          <span
            key={index}
            style={{
              left: `${((index + 0.5) / columns.length) * 100}%`,
              transform: `translateX(${index === 0 ? "-12px" : index === columns.length - 1 ? "calc(-100% + 12px)" : "-50%"})`,
            }}
          >
            {columns[index]?.short}
          </span>
        ))}
      </div>
      {table && (
        <div className="of-table-wrap" id={tableId}>
          <table className="of-table">
            <thead>
              <tr>
                <th scope="col">{weekly ? "Semaine" : "Jour"}</th>
                <th scope="col">Visites</th>
                <th scope="col">Depuis une IA</th>
                <th scope="col">Pages vues</th>
              </tr>
            </thead>
            <tbody>
              {[...columns].reverse().map((column) => (
                <tr key={column.key}>
                  <th scope="row">{column.title}</th>
                  <td>{number(column.visits)}</td>
                  <td>{number(column.ai)}</td>
                  <td>{number(column.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** What a column says, for the screen readers (and the slider's value). */
function describe(column: Column | undefined): string {
  if (!column) return "";
  return `${column.title} : ${column.visits} visite${column.visits > 1 ? "s" : ""}, ${column.ai} depuis un assistant IA, ${column.views} page${column.views > 1 ? "s" : ""} vue${column.views > 1 ? "s" : ""}`;
}

/** A ranked list: label and value, with a thin bar of the value (same hue for every row). */
function RankList({
  items,
  total,
  label,
  limit = 8,
  mono,
}: {
  items: Ranked[];
  total: number;
  label: string;
  limit?: number;
  mono?: boolean;
}) {
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...items.map((i) => i.count));
  const shown = all ? items : items.slice(0, limit);
  return (
    <>
      <ol className="of-rank" aria-label={label}>
        {shown.map((item) => (
          <li key={item.key} className="of-rank__row">
            <span className={`of-rank__label${mono ? " of-mono" : ""}`} title={item.label}>
              {item.label}
            </span>
            <span className="of-rank__value">
              {number(item.count)}
              <span className="of-rank__share">{percent(item.count, total)}</span>
            </span>
            <span className="of-rank__track" aria-hidden>
              <span className="of-rank__bar" style={{ width: `${(item.count / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ol>
      {items.length > limit && (
        <Button variant="ghost" size="sm" className="of-rank__more" onClick={() => setAll(!all)}>
          {all ? "Voir moins" : `Voir tout (${items.length})`}
        </Button>
      )}
    </>
  );
}

const GROUP_HINTS: Record<StatsGroup, string> = {
  ai: "ChatGPT, Perplexity, Claude, Gemini, Copilot…",
  search: "Google, Bing, Qwant, DuckDuckGo…",
  social: "Facebook, Instagram, LinkedIn…",
  site: "Liens depuis d'autres sites, campagnes (utm_source)",
  direct: "Adresse tapée, favori, lien dans un e-mail ou une application",
};

/** Sources grouped: assistants, search engines, networks, other sites, direct. */
function Sources({ summary }: { summary: StatsSummary }) {
  const max = Math.max(1, ...summary.groups.map((g) => g.count));
  return (
    <ol className="of-rank of-rank--groups" aria-label="Sources des visites">
      {summary.groups.map((group) => {
        const children =
          group.key === "site"
            ? summary.sites.map((s) => ({
                ...s,
                label: s.key === "autres" ? "Autres sites" : s.label,
              }))
            : summary.sources.filter((s) => s.group === group.key);
        return (
          <li key={group.key} className="of-rank__group">
            <div className="of-rank__row">
              <span className="of-rank__label" title={GROUP_HINTS[group.key]}>
                {STATS_GROUPS[group.key]}
              </span>
              <span className="of-rank__value">
                {number(group.count)}
                <span className="of-rank__share">{percent(group.count, summary.visits)}</span>
              </span>
              <span className="of-rank__track" aria-hidden>
                <span className="of-rank__bar" style={{ width: `${(group.count / max) * 100}%` }} />
              </span>
            </div>
            {group.key !== "direct" && children.length > 0 && (
              <ul className="of-rank__children">
                {children.slice(0, 6).map((child) => (
                  <li key={child.key}>
                    <span>{child.label}</span>
                    <span>{number(child.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const RATINGS: Record<VitalRating, { label: string; tone: Tone }> = {
  good: { label: "Bon", tone: "green" },
  ni: { label: "À améliorer", tone: "orange" },
  poor: { label: "Lent", tone: "red" },
};

/**
 * The speed visitors feel (Core Web Vitals, Google's thresholds): per measure, Google's verdict
 * (a status chip: dot and word) and the share of fast page loads (a meter in the accent).
 */
function Speed({ vitals }: { vitals: StatsSummary["vitals"] }) {
  return (
    <div className="of-card">
      <h2>Vitesse ressentie par les visiteurs</h2>
      {vitals.length === 0 ? (
        <p className="of-card__lead">
          Mesurée chez les vrais visiteurs, elle s'affiche avec les prochaines visites. Google en
          tient compte pour classer les pages.
        </p>
      ) : (
        <>
          <ul className="of-speed" aria-label="Vitesse ressentie">
            {vitals.map((vital) => (
              <li key={vital.key} className="of-speed__row">
                <span className="of-speed__name">
                  <strong>{vital.label}</strong>
                  <span className="of-subtle">{vital.hint}</span>
                </span>
                <StatusChip tone={RATINGS[vital.rating].tone}>
                  {vital.rating === "poor"
                    ? VITALS[vital.key].poorLabel
                    : RATINGS[vital.rating].label}
                </StatusChip>
                <span className="of-speed__share">
                  {percent(vital.good, vital.total)} {VITALS[vital.key].fast}
                  <span className="of-rank__track" aria-hidden>
                    <span
                      className="of-rank__bar"
                      style={{ width: `${(vital.good / vital.total) * 100}%` }}
                    />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="of-subtle of-speed__note">
            Selon les seuils de Google, sur {number(Math.max(...vitals.map((v) => v.total)))}{" "}
            chargements de page mesurés. « Bon » : au moins trois chargements sur quatre le sont.
          </p>
        </>
      )}
    </div>
  );
}

export function StatsView() {
  const { services, pages, settings, navigate } = useAdmin();
  const [docs, setDocs] = useState<StatsDoc[]>();
  const [error, setError] = useState<string>();
  const [days, setDays] = useState<(typeof PERIODS)[number]["days"]>(30);
  const [optOut, setOptOut] = useState(readOptOut);
  const today = statsDay(new Date());

  useEffect(() => {
    let cancelled = false;
    getDocs(
      query(collection(services.db, COLLECTIONS.stats), where("day", ">=", addDays(today, -89))),
    )
      .then((snapshot) => {
        if (!cancelled) setDocs(snapshot.docs.map((d) => d.data() as StatsDoc));
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [services.db, today]);

  const titles = useMemo(() => new Map(pages.map((p) => [slugToPath(p.slug), p.title])), [pages]);
  const summary = useMemo(
    () =>
      docs && summarizeStats(docs, statsPeriod(days, today), (path) => titles.get(path) ?? path),
    [docs, days, today, titles],
  );
  const off = settings?.site?.stats === "off";

  return (
    <>
      <PageHead
        title="Statistiques"
        description="Les visites du site publié, mesurées sans cookie ni donnée personnelle."
      />
      <section className="of-view">
        <fieldset className="of-segmented of-stats__periods">
          <legend className="of-sr-only">Période</legend>
          {PERIODS.map((period) => (
            <button
              key={period.days}
              type="button"
              aria-pressed={days === period.days}
              className={days === period.days ? "is-active" : ""}
              onClick={() => setDays(period.days)}
            >
              {period.label}
            </button>
          ))}
        </fieldset>
        {off && (
          <div className="of-callout of-stats__off">
            <span>La mesure d'audience est désactivée : les visites ne sont plus comptées.</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate({ view: "settings", tab: "site" })}
            >
              Réactiver
            </Button>
          </div>
        )}
        {error ? (
          <EmptyState icon="circleAlert" title="Statistiques indisponibles">
            <p>{error}</p>
          </EmptyState>
        ) : !summary ? (
          <Spinner label="Chargement des statistiques…" />
        ) : summary.views === 0 ? (
          <EmptyState icon="chart" title="Aucune visite pour l'instant">
            <p>
              Les visites du site publié apparaîtront ici dès le premier visiteur, avec les pages
              lues et d'où viennent les visiteurs : moteurs de recherche, réseaux sociaux et
              assistants IA comme ChatGPT ou Perplexity.
            </p>
          </EmptyState>
        ) : (
          <>
            <div className="of-stats__tiles">
              <div className="of-stat">
                <span className="of-stat__label">Visites</span>
                <span className="of-stat__value">{number(summary.visits)}</span>
              </div>
              <div className="of-stat">
                <span className="of-stat__label">Pages vues</span>
                <span className="of-stat__value">{number(summary.views)}</span>
              </div>
              <div className="of-stat">
                <span className="of-stat__label">Depuis un assistant IA</span>
                <span className="of-stat__value">{number(summary.aiVisits)}</span>
                <span className="of-stat__note">
                  {percent(summary.aiVisits, summary.visits)} des visites
                </span>
              </div>
            </div>
            <VisitsChart columns={columnsOf(summary, days === 90)} weekly={days === 90} />
            <div className="of-grid-2 of-stats__grid">
              <div className="of-card">
                <h2>Pages les plus vues</h2>
                <RankList items={summary.pages} total={summary.views} label="Pages les plus vues" />
              </div>
              <div className="of-card">
                <h2>D'où viennent les visites</h2>
                <Sources summary={summary} />
              </div>
              <div className="of-card">
                <h2>Pages où arrivent les assistants IA</h2>
                {summary.aiPages.length > 0 ? (
                  <RankList
                    items={summary.aiPages}
                    total={summary.aiVisits}
                    label="Pages où arrivent les assistants IA"
                  />
                ) : (
                  <p className="of-card__lead">
                    Quand ChatGPT, Perplexity, Claude ou Gemini citent votre site et qu'un
                    utilisateur clique, la page où il arrive s'affiche ici.
                  </p>
                )}
              </div>
              <div className="of-card">
                <h2>Appareils</h2>
                <RankList items={summary.devices} total={summary.visits} label="Appareils" />
              </div>
            </div>
            <Speed vitals={summary.vitals} />
          </>
        )}
        <div className="of-card of-stats__privacy">
          <h2>Sans cookie, sans bandeau</h2>
          <p className="of-card__lead">
            Aucun cookie ni identifiant, aucune adresse IP conservée : seuls des totaux par jour
            sont enregistrés, et effacés après 25 mois. Cette mesure est exemptée de consentement
            par la CNIL. Les visiteurs qui demandent à ne pas être suivis ne sont pas comptés.
          </p>
          <div className="of-choices">
            <label className="of-checkbox">
              <input
                type="checkbox"
                checked={optOut}
                onChange={(e) => {
                  writeOptOut(e.target.checked);
                  setOptOut(e.target.checked);
                }}
              />
              <span>
                Ne pas compter mes visites sur cet appareil
                <span className="of-field__hint">
                  Vaut pour ce navigateur ; faites de même sur votre téléphone, depuis l'admin.
                </span>
              </span>
            </label>
          </div>
        </div>
      </section>
    </>
  );
}
