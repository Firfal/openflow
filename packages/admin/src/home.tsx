import {
  type AuditFinding,
  addDays,
  bookingComponentOf,
  COLLECTIONS,
  legalGaps,
  type StatsDoc,
  statsDay,
  statsPeriod,
  summarizeStats,
} from "@openflow/core";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { AiPromo } from "./assistant.js";
import { type Route, useAdmin } from "./context.js";
import { type BookingEntry, type FullPage, getAllPages, subscribeBookings } from "./data.js";
import { Icon, type IconName } from "./icons.js";
import { sender } from "./messages.js";
import { SiteStatus } from "./pages.js";
import { adviceTarget } from "./publish.js";
import { PageHead } from "./shell.js";
import { Button, IconButton, Spinner, timeAgo } from "./ui.js";

/** Above this number of pages, the audit waits for a click (it reads every page). */
const AUTO_AUDIT_MAX_PAGES = 50;
const START_HIDDEN_KEY = "cms:home-start-hidden";

/** Pages read for the audit, kept while no page changed (the dashboard is opened often). */
let pagesCache: { stamp: string; pages: FullPage[] } | undefined;

interface Step {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  action: string;
  route?: Route;
  run?: () => void;
}

/** « Pour bien démarrer »: what makes a new site complete, each with the way to do it. */
function GettingStarted() {
  const { config, settings, releases, agents, navigate } = useAdmin();
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(START_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const site = settings?.site;
  const business = site?.business;
  const steps: Step[] = [
    {
      id: "business",
      label: "Présenter votre établissement",
      hint: "Adresse, téléphone et horaires, lus par Google et les moteurs IA.",
      done: Boolean(business?.name && (business.phone || business.email)),
      action: "Remplir",
      route: { view: "settings", tab: "business" },
    },
    {
      id: "legal",
      label: "Compléter les informations légales",
      hint: "Les mentions légales et la politique de confidentialité s'écrivent toutes seules.",
      done:
        legalGaps({
          legal: site?.legal,
          business,
          siteName: site?.name ?? config.site.name,
        }).length === 0,
      action: "Compléter",
      route: { view: "settings", tab: "legal" },
    },
    {
      id: "url",
      label: "Indiquer l'adresse du site",
      hint: "Pour Google, les partages et le plan du site.",
      done: Boolean(site?.url ?? config.site.url),
      action: "Indiquer",
      route: { view: "settings", tab: "site" },
    },
    {
      id: "publish",
      label: "Faire la première publication",
      hint: "Tout reste en brouillon tant que le site n'est pas publié.",
      done: releases.some((release) => release.status === "live"),
      action: "Publier",
      run: () => window.dispatchEvent(new CustomEvent("openflow:publish")),
    },
    {
      id: "google",
      label: "Relier Google Search Console",
      hint: "Pour voir ce que les gens cherchent avant d'arriver sur le site.",
      done: Boolean(site?.verification?.google),
      action: "Relier",
      route: { view: "stats" },
    },
    {
      id: "ai",
      label: "Connecter votre IA",
      hint: "Claude ou ChatGPT modifie le site quand vous le lui demandez.",
      done: agents.length > 0,
      action: "Connecter",
      route: { view: "assistant" },
    },
  ];
  const done = steps.filter((step) => step.done).length;
  if (hidden || done === steps.length) return null;
  const hide = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(START_HIDDEN_KEY, "1");
    } catch {
      // Private mode: hidden for this visit.
    }
  };
  return (
    <section className="of-card of-start" aria-labelledby="of-start-title">
      <header className="of-card__header">
        <div>
          <h2 id="of-start-title">Pour bien démarrer</h2>
          <p className="of-card__lead">
            {done} sur {steps.length} fait{done > 1 ? "s" : ""}
          </p>
        </div>
        <IconButton icon="x" size="sm" label="Masquer « Pour bien démarrer »" onClick={hide} />
      </header>
      <div
        className="of-meter"
        role="progressbar"
        aria-label="Avancement"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
      >
        <span style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="of-steps">
        {steps.map((step) => (
          <li key={step.id} className={step.done ? "is-done" : undefined}>
            <span className="of-steps__check" aria-hidden>
              {step.done && <Icon name="check" size={14} />}
            </span>
            <span className="of-steps__text">
              <strong>{step.label}</strong>
              <span className="of-subtle">{step.done ? "Fait" : step.hint}</span>
            </span>
            {!step.done && (
              <Button
                size="sm"
                onClick={() => (step.route ? navigate(step.route) : step.run?.())}
                aria-label={`${step.label} : ${step.action}`}
              >
                {step.action}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Upcoming appointments (the site takes bookings), live. */
function useUpcomingBookings(enabled: boolean): BookingEntry[] | undefined {
  const { services } = useAdmin();
  const [bookings, setBookings] = useState<BookingEntry[]>();
  useEffect(() => {
    if (!enabled) return;
    return subscribeBookings(services.db, setBookings, () => setBookings([]));
  }, [enabled, services.db]);
  return useMemo(() => {
    const now = new Date().toISOString();
    return bookings?.filter((b) => b.status === "confirmed" && b.end > now).slice(0, 3);
  }, [bookings]);
}

/** Visits of the last 7 days (the cookieless measure), read once. */
function useWeekVisits(enabled: boolean): number | undefined {
  const { services } = useAdmin();
  const [visits, setVisits] = useState<number>();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const today = statsDay(new Date());
    getDocs(
      query(collection(services.db, COLLECTIONS.stats), where("day", ">=", addDays(today, -6))),
    ).then(
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as StatsDoc);
        if (!cancelled) setVisits(summarizeStats(docs, statsPeriod(7, today), (p) => p).visits);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, services.db]);
  return visits;
}

function ActivityRow({
  icon,
  title,
  meta,
  onOpen,
  label,
}: {
  icon: IconName;
  title: string;
  meta: string;
  onOpen: () => void;
  label: string;
}) {
  return (
    <li>
      <Icon name={icon} />
      <span className="of-steps__text">
        <strong>{title}</strong>
        <span className="of-subtle">{meta}</span>
      </span>
      <Button size="sm" variant="ghost" onClick={onOpen} aria-label={label}>
        Ouvrir
      </Button>
    </li>
  );
}

/** Messages to read, next appointments and the week's visits: what happened on the site. */
function Activity() {
  const { config, messages, settings, navigate } = useAdmin();
  const booking = Boolean(bookingComponentOf(config.components));
  const upcoming = useUpcomingBookings(booking);
  const measured = settings?.site?.stats !== "off";
  const visits = useWeekVisits(measured);
  const unread = messages.filter((m) => !m.read && !m.spam);
  const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="of-card" aria-labelledby="of-activity-title">
      <h2 id="of-activity-title">Activité</h2>
      <ul className="of-steps of-activity">
        {measured && (
          <ActivityRow
            icon="chart"
            title={
              visits === undefined
                ? "Visites des 7 derniers jours…"
                : `${visits} visite${visits > 1 ? "s" : ""} ces 7 derniers jours`
            }
            meta="Mesurées sans cookie"
            label="Ouvrir les statistiques"
            onOpen={() => navigate({ view: "stats" })}
          />
        )}
        {unread.length === 0 ? (
          <ActivityRow
            icon="inbox"
            title="Aucun message non lu"
            meta={messages.length > 0 ? `${messages.length} au total` : "Rien pour l'instant"}
            label="Ouvrir les messages"
            onOpen={() => navigate({ view: "messages" })}
          />
        ) : (
          unread
            .slice(0, 3)
            .map((message) => (
              <ActivityRow
                key={message.id}
                icon="mail"
                title={`Message de ${sender(message)}`}
                meta={`${message.formTitle} · reçu ${timeAgo(message.createdAt)}`}
                label={`Lire le message de ${sender(message)}`}
                onOpen={() => navigate({ view: "messages" })}
              />
            ))
        )}
        {booking &&
          (upcoming?.length === 0 ? (
            <ActivityRow
              icon="calendarCheck"
              title="Aucun rendez-vous à venir"
              meta="Les visiteurs réservent depuis le site"
              label="Ouvrir les rendez-vous"
              onOpen={() => navigate({ view: "bookings" })}
            />
          ) : (
            upcoming?.map((b) => (
              <ActivityRow
                key={b.id}
                icon="calendarCheck"
                title={`${b.name} · ${b.service}`}
                meta={`${day.format(new Date(b.start))} à ${b.time}`}
                label={`Voir le rendez-vous de ${b.name}`}
                onOpen={() => navigate({ view: "bookings" })}
              />
            ))
          ))}
      </ul>
    </section>
  );
}

/** The site audit's first pieces of advice (what helps Google and AI assistants). */
function Advice() {
  const { config, services, pages, settings, navigate } = useAdmin();
  const auto = pages.length <= AUTO_AUDIT_MAX_PAGES;
  const [requested, setRequested] = useState(auto);
  const [findings, setFindings] = useState<AuditFinding[]>();
  const stamp = pages.reduce((max, p) => (p.updatedAt > max ? p.updatedAt : max), "");

  useEffect(() => {
    if (!requested) return;
    let cancelled = false;
    const load = async () => {
      const [{ auditSite }, full] = await Promise.all([
        import("./publish-checks.js"),
        pagesCache?.stamp === stamp
          ? Promise.resolve(pagesCache.pages)
          : getAllPages(services.db).then((loaded) => {
              pagesCache = { stamp, pages: loaded };
              return loaded;
            }),
      ]);
      if (cancelled) return;
      setFindings(
        auditSite({
          config,
          pages: full,
          site: settings?.site ?? { name: config.site.name, lang: config.site.lang ?? "fr" },
          today: statsDay(new Date()),
          settings: settings?.values ?? {},
        }).findings.filter((finding) => finding.severity !== "low"),
      );
    };
    load().catch(() => !cancelled && setFindings([]));
    return () => {
      cancelled = true;
    };
  }, [requested, stamp, config, services.db, settings?.site, settings?.values]);

  return (
    <section className="of-card" aria-labelledby="of-advice-title">
      <h2 id="of-advice-title">Conseils pour être trouvé</h2>
      {!requested ? (
        <div className="of-row">
          <p className="of-card__lead">Google et les assistants IA : ce qui manque au site.</p>
          <Button onClick={() => setRequested(true)}>Analyser le site</Button>
        </div>
      ) : !findings ? (
        <Spinner inline label="Analyse du site…" />
      ) : findings.length === 0 ? (
        <p className="of-card__lead">Rien à signaler : le site donne tout ce qu'il faut.</p>
      ) : (
        <ul className="of-steps" aria-label="Conseils">
          {findings.slice(0, 3).map((finding, index) => {
            const target = adviceTarget(finding);
            return (
              <li key={`${finding.code}-${index}`}>
                <Icon name={finding.severity === "high" ? "circleAlert" : "info"} />
                <span className="of-steps__text">
                  <strong>{finding.page?.title ?? "Tout le site"}</strong>
                  <span className="of-subtle">{finding.message}</span>
                </span>
                {target && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(target)}
                    aria-label={`Voir : ${finding.message}`}
                  >
                    Voir
                  </Button>
                )}
              </li>
            );
          })}
          {findings.length > 3 && (
            <li className="of-steps__more">
              {findings.length - 3} autre{findings.length - 3 > 1 ? "s" : ""} dans la fenêtre
              Publier.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** « Tableau de bord »: where the owner lands. The state of the site and what to do next. */
export function HomeView() {
  return (
    <>
      <PageHead
        title="Tableau de bord"
        description="L'état du site, ce qu'il reste à faire et ce qui s'y passe."
      />
      <section className="of-view">
        <SiteStatus />
        <GettingStarted />
        <div className="of-home">
          <Activity />
          <Advice />
        </div>
        <AiPromo />
      </section>
    </>
  );
}
