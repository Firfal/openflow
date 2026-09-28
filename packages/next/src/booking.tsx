"use client";

import type { BusinessInfo } from "@openflow/core";
import {
  BOOKING_LABEL_DEFAULTS,
  type BookingLabels,
  type BookingRules,
  type BusyRange,
  bookingDays,
  bookingIcs,
  bookingTimeZone,
  formatDate,
  formatTime,
  localDateTime,
  validateBookingContact,
} from "@openflow/core/booking";
import { type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * Appointment booking of a « Prise de rendez-vous » section: the visitor picks a service, a day
 * and a free time (from the business's opening hours, the section's rules and the appointments
 * already taken), then gives their name and e-mail. `cmsBooking` (`/cms/booking`) takes the time
 * in one transaction. The section passes its classes through `classNames`; states are exposed as
 * `aria-pressed`, `aria-checked`, `disabled` and `data-status`.
 */

export interface OpenFlowBookingClassNames {
  root?: string;
  /** Room kept for the days and times while they load (no text). */
  placeholder?: string;
  step?: string;
  legend?: string;
  services?: string;
  service?: string;
  serviceName?: string;
  serviceMeta?: string;
  days?: string;
  day?: string;
  nav?: string;
  navButton?: string;
  times?: string;
  time?: string;
  empty?: string;
  form?: string;
  summary?: string;
  field?: string;
  label?: string;
  input?: string;
  error?: string;
  button?: string;
  secondary?: string;
  status?: string;
  note?: string;
}

export interface OpenFlowBookingProps {
  /** Id of the section (Puck `id`): the server finds the booking rules with it. */
  sectionId: string;
  rules: BookingRules;
  /** Opening hours, closures and country of the business (`puck.metadata.site.business`). */
  business?: Pick<BusinessInfo, "hours" | "closures" | "country" | "name" | "street" | "city">;
  submitLabel: string;
  successMessage: string;
  note?: string;
  /** Texts shown before any choice (`bookingLabels` prop, `bookingLabelsField()`). */
  labels?: Partial<BookingLabels>;
  /** Language of the page (`pageLang(puck.metadata)`). */
  lang?: string;
  /** In the editor: the free times are shown without the appointments taken, never booked. */
  editing?: boolean;
  classNames?: OpenFlowBookingClassNames;
  /** Defaults to `/cms/booking` (the emulator's function with `NEXT_PUBLIC_CMS_EMULATORS`). */
  endpoint?: string;
}

const TEXTS = {
  fr: {
    day: "Jour",
    time: "Heure",
    earlier: "Jours précédents",
    later: "Jours suivants",
    full: "complet",
    closed: "fermé",
    noTime: "Plus de créneau libre ce jour-là : choisissez un autre jour.",
    noDay: "Aucun créneau libre dans les semaines à venir. Contactez-nous directement.",
    noHours:
      "Renseignez les horaires d'ouverture (Réglages > Établissement) : les créneaux en dépendent.",
    noServices: "Ajoutez une prestation dans les champs de cette section.",
    closedPublic: "La prise de rendez-vous en ligne n'est pas encore ouverte.",
    loading: "Chargement des disponibilités…",
    unavailable: "Les disponibilités n'ont pas pu être chargées. Rechargez la page.",
    yours: "Votre rendez-vous",
    sending: "Réservation…",
    failed: "La réservation n'a pas abouti. Vérifiez votre connexion et réessayez.",
    invalid: "Vérifiez les champs signalés.",
    calendar: "Ajouter à mon agenda",
    another: "Prendre un autre rendez-vous",
    at: "à",
    toolTimes:
      "Donne les prestations proposées et les créneaux libres des prochains jours (heure du lieu).",
    toolBook:
      "Prépare un rendez-vous : choisit la prestation, le jour et l'heure et remplit les coordonnées. Le visiteur relit puis confirme en cliquant sur le bouton de réservation.",
    prepared: "Rendez-vous prêt : le visiteur relit et clique sur le bouton pour confirmer.",
    toolSubmit:
      "Réserve le créneau choisi sur la page (prestation, jour et heure) avec les coordonnées du visiteur. Le visiteur relit et confirme.",
  },
  en: {
    day: "Day",
    time: "Time",
    earlier: "Earlier days",
    later: "Later days",
    full: "full",
    closed: "closed",
    noTime: "No free time left that day: choose another day.",
    noDay: "No free time in the coming weeks. Please contact us directly.",
    noHours: "Fill in the opening hours (Settings > Business): the free times depend on them.",
    noServices: "Add a service in the fields of this section.",
    closedPublic: "Online booking is not open yet.",
    loading: "Loading availability…",
    unavailable: "Availability could not be loaded. Reload the page.",
    yours: "Your appointment",
    sending: "Booking…",
    failed: "The booking did not go through. Check your connection and try again.",
    invalid: "Please check the highlighted fields.",
    calendar: "Add to my calendar",
    another: "Book another appointment",
    at: "at",
    toolTimes: "Lists the services offered and the free times of the coming days (local time).",
    toolBook:
      "Prepares an appointment: picks the service, day and time and fills in the contact details. The visitor reviews and confirms by clicking the booking button.",
    prepared: "Appointment ready: the visitor reviews it and clicks the button to confirm.",
    toolSubmit:
      "Books the time chosen on the page (service, day and time) with the visitor's details. The visitor reviews and confirms.",
  },
};

/** The default texts of the form in English (the owner's own texts come through `labels`). */
const ENGLISH_LABELS: BookingLabels = {
  service: "Service",
  minutes: "min",
  chooseTime: "Choose a day and a time.",
  name: "Name",
  email: "E-mail",
  phone: "Phone",
  message: "Message",
  optional: "optional",
};

const DAYS_PER_PAGE = 7;

function defaultEndpoint(): string {
  if (process.env.NEXT_PUBLIC_CMS_EMULATORS === "1" && typeof window !== "undefined") {
    const region = process.env.NEXT_PUBLIC_CMS_REGION || "europe-west1";
    return `http://${window.location.hostname}:5001/demo-openflow/${region}/cmsBooking`;
  }
  return "/cms/booking";
}

type Status = { kind: "idle" | "sending" | "sent" | "error"; message?: string };
type ModelContext = {
  registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown;
};

export function OpenFlowBooking({
  sectionId,
  rules,
  business,
  submitLabel,
  successMessage,
  note,
  labels: given,
  lang: pageLang = "fr",
  editing,
  classNames: c = {},
  endpoint,
}: OpenFlowBookingProps) {
  const id = useId();
  const lang = pageLang.startsWith("fr") ? "fr" : "en";
  const t = TEXTS[lang];
  const labels: BookingLabels = {
    ...(lang === "fr" ? BOOKING_LABEL_DEFAULTS : ENGLISH_LABELS),
    ...Object.fromEntries(Object.entries(given ?? {}).filter(([, value]) => value)),
  };
  const timeZone = bookingTimeZone(business);
  // The days and times depend on the visitor's clock: they are shown once the page runs.
  const [mounted, setMounted] = useState(false);
  const shownAt = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState<BusyRange[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [loaded, setLoaded] = useState<"loading" | "ready" | "failed">(
    editing ? "ready" : "loading",
  );
  const [service, setService] = useState(0);
  const [date, setDate] = useState<string>();
  const [time, setTime] = useState<string>();
  const [page, setPage] = useState(0);
  const [values, setValues] = useState({ name: "", email: "", phone: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [booked, setBooked] = useState<{ id: string; start: string; end: string }>();

  const chosen = rules.services[service] ?? rules.services[0];
  const hasHours = Object.values(business?.hours ?? {}).some((ranges) => ranges?.length);

  const loadBusy = useCallback(async () => {
    if (editing) return;
    try {
      const today = localDateTime(Date.now(), timeZone).date;
      const response = await fetch(
        `${endpoint ?? defaultEndpoint()}?from=${today}&days=${rules.horizon + 1}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as { busy?: BusyRange[]; now?: string };
      if (!response.ok || !Array.isArray(result.busy)) throw new Error("busy");
      setBusy(result.busy);
      if (result.now) setClockOffset(Date.parse(result.now) - Date.now());
      setLoaded("ready");
    } catch {
      setLoaded("failed");
    }
  }, [editing, endpoint, rules.horizon, timeZone]);

  useEffect(() => {
    shownAt.current = Date.now();
    setMounted(true);
    void loadBusy();
  }, [loadBusy]);

  const days = useMemo(
    () =>
      mounted && chosen && hasHours
        ? bookingDays(chosen.minutes, {
            rules,
            hours: business?.hours,
            closures: business?.closures,
            busy,
            now: Date.now() + clockOffset,
            timeZone,
          })
        : [],
    [
      mounted,
      chosen,
      hasHours,
      rules,
      business?.hours,
      business?.closures,
      busy,
      clockOffset,
      timeZone,
    ],
  );
  const open = days.filter((day) => day.slots.length > 0);
  // The first day with free times is selected; a choice that is no longer free is dropped.
  const selected = days.find((day) => day.date === date) ?? open[0];
  const slots = selected?.slots ?? [];
  const pickedTime = time && slots.includes(time) ? time : undefined;
  const pages = Math.max(1, Math.ceil(days.length / DAYS_PER_PAGE));
  const selectedPage = selected ? Math.floor(days.indexOf(selected) / DAYS_PER_PAGE) : 0;
  const shownPage = Math.min(page, pages - 1);
  useEffect(() => setPage(selectedPage), [selectedPage]);

  // Focus the first field to fix, or the result.
  useEffect(() => {
    if (status.kind !== "sent" && status.kind !== "error") return;
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const target = invalid ?? statusRef.current;
    target?.focus({ preventScroll: true });
    // The confirmation replaces the (longer) form: bring it back into view.
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  }, [status]);

  const dayLabel = (day: string) =>
    formatDate(day, lang, { weekday: "long", day: "numeric", month: "long" });
  const summary =
    chosen && selected && pickedTime
      ? `${chosen.name} · ${dayLabel(selected.date)} ${t.at} ${formatTime(pickedTime, lang)}`
      : undefined;

  const book = async (agent: boolean): Promise<string> => {
    if (editing || status.kind === "sending") return t.failed;
    if (!chosen || !selected || !pickedTime) {
      setStatus({ kind: "error", message: labels.chooseTime });
      return labels.chooseTime;
    }
    const local = validateBookingContact(values, lang);
    if (!local.ok) {
      setErrors(local.errors);
      setStatus({ kind: "error", message: t.invalid });
      return `${t.invalid} ${Object.values(local.errors).join(" ")}`;
    }
    setErrors({});
    setStatus({ kind: "sending" });
    try {
      const form = formRef.current ? new FormData(formRef.current) : undefined;
      const response = await fetch(endpoint ?? defaultEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: window.location.pathname,
          sectionId,
          service: rules.services.indexOf(chosen),
          date: selected.date,
          time: pickedTime,
          values,
          website: String(form?.get("website") ?? ""),
          elapsed: Date.now() - shownAt.current,
          ...(agent ? { agent: true } : {}),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        errors?: Record<string, string>;
        taken?: boolean;
        booking?: { id: string; start: string; end: string };
      };
      if (response.ok && result.ok) {
        setBooked(result.booking);
        setStatus({ kind: "sent" });
        return successMessage;
      }
      if (result.taken) {
        setTime(undefined);
        void loadBusy();
      }
      setErrors(result.errors ?? {});
      setStatus({ kind: "error", message: result.error || t.failed });
      return result.error || t.failed;
    } catch {
      setStatus({ kind: "error", message: t.failed });
      return t.failed;
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Sent by the AI assistant of the visitor's browser (WebMCP): it gets the result back.
    const native = event.nativeEvent as SubmitEvent & {
      agentInvoked?: boolean;
      respondWith?: (result: Promise<unknown>) => void;
    };
    const agent = native.agentInvoked === true;
    const result = book(agent);
    if (agent && typeof native.respondWith === "function") native.respondWith(result);
  };

  // WebMCP: the visitor's AI assistant reads the free times and prepares an appointment; the
  // visitor confirms it with the button. Browsers without WebMCP ignore this.
  const latest = useRef({ days, rules, chosen });
  latest.current = { days, rules, chosen };
  useEffect(() => {
    if (editing) return;
    const context = [
      (document as Document & { modelContext?: ModelContext }).modelContext,
      (navigator as Navigator & { modelContext?: ModelContext }).modelContext,
    ].find((candidate) => typeof candidate?.registerTool === "function");
    if (!context) return;
    const controller = new AbortController();
    const name = sectionId.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "booking";
    try {
      context.registerTool(
        {
          name: `appointment_times_${name}`,
          description: t.toolTimes,
          inputSchema: { type: "object", properties: {} },
          execute: async () => ({
            timeZone,
            services: latest.current.rules.services.map((s, index) => ({
              index,
              name: s.name,
              minutes: s.minutes,
              ...(s.price ? { price: s.price } : {}),
            })),
            days: latest.current.days
              .filter((day) => day.slots.length > 0)
              .slice(0, 14)
              .map((day) => ({ date: day.date, times: day.slots })),
          }),
          annotations: { readOnlyHint: true },
        },
        { signal: controller.signal },
      );
      context.registerTool(
        {
          name: `prepare_appointment_${name}`,
          description: t.toolBook,
          inputSchema: {
            type: "object",
            properties: {
              service: { type: "integer" },
              date: { type: "string", description: "YYYY-MM-DD" },
              time: { type: "string", description: "HH:mm" },
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              message: { type: "string" },
            },
            required: ["date", "time", "name", "email"],
          },
          execute: async (input: Record<string, unknown>) => {
            const index = Number(input.service ?? 0);
            if (latest.current.rules.services[index]) setService(index);
            setDate(String(input.date));
            setTime(String(input.time));
            setValues({
              name: String(input.name ?? ""),
              email: String(input.email ?? ""),
              phone: String(input.phone ?? ""),
              message: String(input.message ?? ""),
            });
            return t.prepared;
          },
        },
        { signal: controller.signal },
      );
    } catch {
      // Unsupported shape: nothing registered.
    }
    return () => controller.abort();
  }, [editing, sectionId, t, timeZone]);

  const download = () => {
    if (!booked || !chosen) return;
    const place = [business?.name, business?.street, business?.city].filter(Boolean).join(", ");
    const blob = new Blob(
      [
        bookingIcs({
          uid: `${booked.id}@${window.location.host}`,
          start: Date.parse(booked.start),
          end: Date.parse(booked.end),
          summary: [chosen.name, business?.name].filter(Boolean).join(" · "),
          ...(place ? { location: place } : {}),
          description: window.location.href,
        }),
      ],
      { type: "text/calendar" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "rendez-vous.ics";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const restart = () => {
    setBooked(undefined);
    setStatus({ kind: "idle" });
    setTime(undefined);
    setValues((current) => ({ ...current, message: "" }));
    void loadBusy();
  };

  if (rules.services.length === 0 || !hasHours) {
    return (
      <p className={c.empty} data-status="empty">
        {editing ? (rules.services.length === 0 ? t.noServices : t.noHours) : t.closedPublic}
      </p>
    );
  }

  if (status.kind === "sent" && summary) {
    return (
      <div className={c.root}>
        <p ref={statusRef} tabIndex={-1} role="status" className={c.status} data-status="sent">
          {successMessage}
        </p>
        <p className={c.summary}>
          <strong>{t.yours}</strong> : {summary}
        </p>
        <div className={c.nav}>
          <button type="button" className={c.button} onClick={download}>
            {t.calendar}
          </button>
          <button type="button" className={c.secondary} onClick={restart}>
            {t.another}
          </button>
        </div>
      </div>
    );
  }

  const field = (key: "name" | "email" | "phone" | "message", required: boolean) => {
    const inputId = `${id}-${key}`;
    const error = errors[key];
    const common = {
      id: inputId,
      name: key,
      value: values[key],
      required,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${inputId}-error` : undefined,
      className: c.input,
      // The parameter as the visitor's assistant sees it (WebMCP declarative API).
      toolparamdescription: labels[key],
      onChange: (event: { target: { value: string } }) =>
        setValues((current) => ({ ...current, [key]: event.target.value })),
    };
    return (
      <div className={c.field}>
        <label className={c.label} htmlFor={inputId}>
          {labels[key]}
          {required ? <span aria-hidden="true"> *</span> : <span> ({labels.optional})</span>}
        </label>
        {key === "message" ? (
          <textarea rows={3} {...common} />
        ) : (
          <input
            type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
            autoComplete={key === "email" ? "email" : key === "phone" ? "tel" : "name"}
            spellCheck={key === "email" ? false : undefined}
            {...common}
          />
        )}
        {error && (
          <p id={`${inputId}-error`} className={c.error}>
            {error}
          </p>
        )}
      </div>
    );
  };

  // After loading: no free time in the whole period, so no form.
  const nothingFree = mounted && loaded === "ready" && open.length === 0;
  return (
    <div className={c.root}>
      <fieldset className={c.step}>
        <legend className={c.legend}>{labels.service}</legend>
        <div className={c.services}>
          {rules.services.map((item, index) => (
            <label key={`${item.name}-${index}`} className={c.service}>
              <input
                type="radio"
                name={`${id}-service`}
                checked={index === service}
                onChange={() => {
                  setService(index);
                  setTime(undefined);
                }}
              />
              <span className={c.serviceName}>{item.name}</span>
              <span className={c.serviceMeta}>
                {formatMinutes(item.minutes, labels.minutes)}
                {item.price ? ` · ${item.price}` : ""}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {!mounted ? (
        <div className={c.placeholder} aria-hidden="true" />
      ) : loaded === "loading" ? (
        <p className={c.empty} role="status">
          {t.loading}
        </p>
      ) : loaded === "failed" ? (
        <p className={c.empty} role="alert">
          {t.unavailable}
        </p>
      ) : nothingFree ? (
        <p className={c.empty}>{t.noDay}</p>
      ) : (
        <>
          <fieldset className={c.step}>
            <legend className={c.legend}>{t.day}</legend>
            <div className={c.nav}>
              <button
                type="button"
                className={c.navButton}
                disabled={shownPage === 0}
                aria-label={t.earlier}
                onClick={() => setPage(shownPage - 1)}
              >
                <span aria-hidden="true">‹</span>
              </button>
              <div className={c.days}>
                {days
                  .slice(shownPage * DAYS_PER_PAGE, (shownPage + 1) * DAYS_PER_PAGE)
                  .map((day) => {
                    const full = day.slots.length === 0;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        className={c.day}
                        aria-pressed={day.date === selected?.date}
                        disabled={full}
                        aria-label={`${dayLabel(day.date)}${full ? ` (${hasRangesOn(business, day.date) ? t.full : t.closed})` : ""}`}
                        onClick={() => {
                          setDate(day.date);
                          setTime(undefined);
                        }}
                      >
                        <span>{formatDate(day.date, lang, { weekday: "short" })}</span>
                        <span>{formatDate(day.date, lang, { day: "numeric" })}</span>
                        <span>{formatDate(day.date, lang, { month: "short" })}</span>
                      </button>
                    );
                  })}
              </div>
              <button
                type="button"
                className={c.navButton}
                disabled={shownPage >= pages - 1}
                aria-label={t.later}
                onClick={() => setPage(shownPage + 1)}
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </fieldset>
          <fieldset className={c.step}>
            <legend className={c.legend}>
              {t.time}
              {selected ? ` · ${dayLabel(selected.date)}` : ""}
            </legend>
            {slots.length === 0 ? (
              <p className={c.empty}>{t.noTime}</p>
            ) : (
              <div className={c.times}>
                {slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={c.time}
                    aria-pressed={slot === pickedTime}
                    onClick={() => {
                      if (selected) setDate(selected.date);
                      setTime(slot);
                    }}
                  >
                    {formatTime(slot, lang)}
                  </button>
                ))}
              </div>
            )}
          </fieldset>
        </>
      )}
      {!nothingFree && (
        <form
          ref={formRef}
          className={c.form}
          noValidate
          onSubmit={submit}
          {...({
            toolname: `book_${sectionId.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "appointment"}`,
            tooldescription: t.toolSubmit,
          } as Record<string, string>)}
        >
          <p className={c.summary} aria-live="polite">
            {summary ? (
              <>
                <strong>{t.yours}</strong> : {summary}
                {chosen?.price ? ` · ${chosen.price}` : ""}
              </>
            ) : (
              labels.chooseTime
            )}
          </p>
          {field("name", true)}
          {field("email", true)}
          {field("phone", false)}
          {field("message", false)}
          {/* Honeypot: invisible to people and assistive technologies, filled by bots. */}
          <div
            aria-hidden="true"
            style={{ position: "absolute", left: "-10000px", height: 0, overflow: "hidden" }}
          >
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
          <button
            type="submit"
            className={c.button}
            disabled={!mounted || status.kind === "sending"}
            aria-disabled={editing || undefined}
          >
            {status.kind === "sending" ? t.sending : submitLabel}
          </button>
          {status.kind === "error" && status.message && (
            <p ref={statusRef} tabIndex={-1} role="alert" className={c.status} data-status="error">
              {status.message}
            </p>
          )}
          {/* The confirmation, shown in the editor so the owner can edit it. */}
          <p role="status" hidden={!editing} className={c.status} data-status="sent">
            {successMessage}
          </p>
          {note && <p className={c.note}>{note}</p>}
        </form>
      )}
    </div>
  );
}

function hasRangesOn(business: OpenFlowBookingProps["business"], date: string): boolean {
  const weekday = (["su", "mo", "tu", "we", "th", "fr", "sa"] as const)[
    new Date(`${date}T12:00:00Z`).getUTCDay()
  ];
  const closed = (business?.closures ?? []).some(
    (closure) => date >= closure.from && date <= (closure.to || closure.from),
  );
  return !closed && Boolean(weekday && business?.hours?.[weekday]?.length);
}

function formatMinutes(minutes: number, unit: string): string {
  if (minutes < 60) return `${minutes}\u00a0${unit}`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)}\u00a0h${rest ? `\u00a0${String(rest).padStart(2, "0")}` : ""}`;
}
