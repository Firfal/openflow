import type { ArrayField, Data, ObjectField, SelectField } from "@puckeditor/core";
import type { BusinessInfo, Closure, TimeRange, Weekday } from "./business.js";

export { formatTime } from "./business.js";
export { formatDate } from "./fields.js";

import type { OpenFlowConfig } from "./config.js";
import { walkComponents } from "./walk.js";

/**
 * Appointments. The owner adds a « Prise de rendez-vous » section (its services, durations and
 * booking rules are fields of the section); the free times follow the business's opening hours
 * and exceptional closures (« Établissement »). A visitor picks a service, a day and a
 * time, and books: `cmsBooking` checks the time against the published section and the other
 * appointments, in one transaction, so that two visitors never get the same time. The owner sees
 * the appointments in the admin (« Rendez-vous ») and by e-mail.
 */

/** Name of the section prop listing the services (it marks a booking section). */
export const BOOKING_SERVICES_PROP = "bookingServices";

/** Appointments are erased this many months after they took place (TTL on `expiresAt`). */
export const BOOKING_RETENTION_MONTHS = 12;

export interface BookingService {
  name: string;
  /** Minutes, as the select field stores them (`"30"`). */
  duration: string;
  price?: string;
  description?: string;
}

/** The booking rules of a section, read from its fields. */
export interface BookingRules {
  services: Array<BookingService & { minutes: number }>;
  /** A slot starts every `step` minutes from the opening time. */
  step: number;
  /** Hours between now and the earliest appointment. */
  notice: number;
  /** Days ahead a visitor can book. */
  horizon: number;
  /** Minutes kept free between two appointments. */
  buffer: number;
}

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240];
const STEPS = [10, 15, 20, 30, 60];
const NOTICES = [0, 1, 2, 4, 12, 24, 48, 72];
const HORIZONS = [7, 14, 30, 60, 90];
const BUFFERS = [0, 5, 10, 15, 30];

const minutesLabel = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ""}`;

/** The services of a booking section: name, duration, price and a short description. */
export function bookingServicesField(
  options: { label?: string } = {},
): ArrayField<BookingService[]> {
  return {
    type: "array",
    label: options.label ?? "Prestations",
    arrayFields: {
      name: { type: "text", label: "Nom", metadata: { openflowInline: false } },
      duration: {
        type: "select",
        label: "Durée",
        options: DURATIONS.map((minutes) => ({
          label: minutesLabel(minutes),
          value: String(minutes),
        })),
      },
      price: { type: "text", label: "Prix (facultatif)", metadata: { openflowInline: false } },
      description: {
        type: "textarea",
        label: "Description (facultative)",
        metadata: { openflowInline: false },
      },
    },
    defaultItemProps: { name: "Nouvelle prestation", duration: "30", price: "", description: "" },
    getItemSummary: (item) => item?.name || "Prestation",
  } as ArrayField<BookingService[]>;
}

const select = (label: string, values: number[], format: (value: number) => string) =>
  ({
    type: "select",
    label,
    options: values.map((value) => ({ label: format(value), value: String(value) })),
  }) as SelectField;

/** The booking rules of a section (fields `bookingStep`, `bookingNotice`…). */
export function bookingRuleFields() {
  return {
    bookingStep: select("Un créneau toutes les", STEPS, minutesLabel),
    bookingNotice: select("Délai avant un rendez-vous", NOTICES, (hours) =>
      hours === 0
        ? "Aucun"
        : hours < 24
          ? `${hours} h`
          : `${hours / 24} jour${hours > 24 ? "s" : ""}`,
    ),
    bookingHorizon: select("Réservable jusqu'à", HORIZONS, (days) =>
      days % 30 === 0
        ? `${days / 30} mois`
        : days % 7 === 0
          ? `${days / 7} semaine${days > 7 ? "s" : ""}`
          : `${days} jours`,
    ),
    bookingBuffer: select("Pause entre deux rendez-vous", BUFFERS, (minutes) =>
      minutes === 0 ? "Aucune" : `${minutes} min`,
    ),
  };
}

/** Texts of the booking form shown before any choice (editable and translatable by the owner). */
export interface BookingLabels {
  service: string;
  minutes: string;
  chooseTime: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  optional: string;
}

export const BOOKING_LABEL_DEFAULTS: BookingLabels = {
  service: "Prestation",
  minutes: "min",
  chooseTime: "Choisissez un jour et une heure.",
  name: "Nom",
  email: "E-mail",
  phone: "Téléphone",
  message: "Message",
  optional: "facultatif",
};

/** The texts of the booking form (`bookingLabels` prop), in one folded group of the panel. */
export function bookingLabelsField(options: { label?: string } = {}): ObjectField<BookingLabels> {
  const text = (label: string) =>
    ({ type: "text", label, metadata: { openflowInline: false } }) as const;
  return {
    type: "object",
    label: options.label ?? "Textes du formulaire",
    objectFields: {
      service: text("Choix de la prestation"),
      minutes: text("Unité des durées (« min »)"),
      chooseTime: text("Invitation à choisir un créneau"),
      name: text("Champ nom"),
      email: text("Champ e-mail"),
      phone: text("Champ téléphone"),
      message: text("Champ message"),
      optional: text("Mention « facultatif »"),
    },
  };
}

/** Default values of the rule fields (for `defaultProps`). */
export const BOOKING_RULE_DEFAULTS = {
  bookingStep: "30",
  bookingNotice: "2",
  bookingHorizon: "30",
  bookingBuffer: "0",
} as const;

const pick = (value: unknown, allowed: number[], fallback: number) => {
  const n = Number(value);
  return allowed.includes(n) ? n : fallback;
};

/** The rules of a booking section, from its props (invalid values fall back to the defaults). */
export function bookingRulesOf(props: Record<string, unknown>): BookingRules {
  const list = Array.isArray(props[BOOKING_SERVICES_PROP])
    ? (props[BOOKING_SERVICES_PROP] as BookingService[])
    : [];
  return {
    services: list
      .filter((service) => service && typeof service.name === "string" && service.name.trim())
      .map((service) => ({ ...service, minutes: pick(service.duration, DURATIONS, 30) })),
    step: pick(props.bookingStep, STEPS, 30),
    notice: pick(props.bookingNotice, NOTICES, 2),
    horizon: pick(props.bookingHorizon, HORIZONS, 30),
    buffer: pick(props.bookingBuffer, BUFFERS, 0),
  };
}

/** The section type taking appointments, if the site has one. */
export function bookingComponentOf(
  components: OpenFlowConfig["components"] | Record<string, { fields?: object } | undefined>,
): string | undefined {
  return Object.entries(components).find(
    ([, component]) => BOOKING_SERVICES_PROP in ((component?.fields ?? {}) as object),
  )?.[0];
}

/** The slug of the first page taking appointments (the snapshot's pages are published). */
export function bookingPageOf(pages: Array<{ slug: string; data: Data }>): string | undefined {
  return pages.find((page) => bookingSectionsOf(page.data).length > 0)?.slug;
}

/** The booking sections of a page (their ids). */
export function bookingSectionsOf(data: Data): string[] {
  const ids: string[] = [];
  walkComponents(data, (item) => {
    const props = item.props as Record<string, unknown>;
    if (Array.isArray(props[BOOKING_SERVICES_PROP]) && typeof props.id === "string") {
      ids.push(props.id);
    }
  });
  return ids;
}

// ---------------------------------------------------------------------------------------------
// Stored documents

/** `cms_bookings/{id}`: an appointment booked by a visitor. */
export interface BookingDoc {
  /** Page and section where it was booked. */
  page: string;
  sectionId: string;
  service: string;
  /** Minutes. */
  duration: number;
  price?: string;
  /** Instants (ISO, UTC). */
  start: string;
  end: string;
  /** The business's local day (`YYYY-MM-DD`) and time (`HH:mm`), and its time zone. */
  date: string;
  time: string;
  timeZone: string;
  name: string;
  email: string;
  phone?: string;
  message?: string;
  status: "confirmed" | "cancelled";
  createdAt: string;
  cancelledAt?: string;
  /** Booked by the visitor's AI assistant (WebMCP). */
  agent?: boolean;
  /** Language of the page (the visitor's). */
  lang?: string;
  /** Erased by Firestore after this date (TTL): 12 months after the appointment. */
  expiresAt: Date;
}

/** `cms_booking_days/{YYYY-MM-DD}`: the times taken that day (no personal data). */
export interface BookingDayDoc {
  busy: Array<{ id: string; start: string; end: string }>;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------------------------
// Time zones

const ZONES: Record<string, string> = {
  FR: "Europe/Paris",
  MC: "Europe/Monaco",
  BE: "Europe/Brussels",
  LU: "Europe/Luxembourg",
  CH: "Europe/Zurich",
  CA: "America/Toronto",
  DE: "Europe/Berlin",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  PT: "Europe/Lisbon",
  NL: "Europe/Amsterdam",
  GB: "Europe/London",
  RE: "Indian/Reunion",
  GP: "America/Guadeloupe",
  MQ: "America/Martinique",
  GF: "America/Cayenne",
  YT: "Indian/Mayotte",
  NC: "Pacific/Noumea",
  PF: "Pacific/Tahiti",
};

/** The business's time zone, from its country (Paris by default). */
export function bookingTimeZone(business: Pick<BusinessInfo, "country"> | undefined): string {
  return ZONES[(business?.country || "FR").toUpperCase()] ?? "Europe/Paris";
}

/** Minutes to add to UTC to get the local time of `timeZone` at that instant. */
function offsetMinutes(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  const local = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return Math.round((local - Math.floor(instant / 60000) * 60000) / 60000);
}

/** The instant (ms) of a local date and time in a time zone: `zonedTime("2026-10-01", "09:00", "Europe/Paris")`. */
export function zonedTime(date: string, time: string, timeZone: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, min] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = guess - offsetMinutes(guess, timeZone) * 60000;
  const second = guess - offsetMinutes(first, timeZone) * 60000;
  return second;
}

/** The local date (`YYYY-MM-DD`) and time (`HH:mm`) of an instant in a time zone. */
export function localDateTime(instant: number, timeZone: string): { date: string; time: string } {
  const shifted = new Date(instant + offsetMinutes(instant, timeZone) * 60000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** `2026-10-01` + 3 days. */
export function addLocalDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const WEEKDAY_OF: Weekday[] = ["su", "mo", "tu", "we", "th", "fr", "sa"];

function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return WEEKDAY_OF[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] as Weekday;
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// ---------------------------------------------------------------------------------------------
// Free times

/** An appointment already taken (instants in ISO), as `cmsBooking` gives them. */
export interface BusyRange {
  start: string;
  end: string;
}

export interface SlotContext {
  rules: BookingRules;
  /** Opening hours (« Établissement »); a day without ranges is closed. */
  hours: Partial<Record<Weekday, TimeRange[]>> | undefined;
  closures?: Closure[];
  busy: BusyRange[];
  /** Now (ms). */
  now: number;
  timeZone: string;
}

function closedOn(date: string, closures: Closure[] | undefined): boolean {
  return (closures ?? []).some(
    (closure) => date >= closure.from && date <= (closure.to || closure.from),
  );
}

/** The free start times (`HH:mm`) of a local day for a service lasting `minutes`. */
export function daySlots(date: string, minutes: number, context: SlotContext): string[] {
  const { rules, timeZone } = context;
  if (closedOn(date, context.closures)) return [];
  const today = localDateTime(context.now, timeZone).date;
  if (date < today || date > addLocalDays(today, rules.horizon)) return [];
  const earliest = context.now + rules.notice * 3600000;
  const busy = context.busy.map((range) => ({
    start: Date.parse(range.start) - rules.buffer * 60000,
    end: Date.parse(range.end) + rules.buffer * 60000,
  }));
  const slots: string[] = [];
  for (const range of context.hours?.[weekdayOf(date)] ?? []) {
    const opens = toMinutes(range.opens);
    const closes = toMinutes(range.closes);
    for (let t = opens; t + minutes <= closes; t += rules.step) {
      const start = zonedTime(date, toTime(t), timeZone);
      const end = start + minutes * 60000;
      if (start < earliest) continue;
      if (busy.some((taken) => taken.start < end && start < taken.end)) continue;
      const time = toTime(t);
      if (!slots.includes(time)) slots.push(time);
    }
  }
  return slots.sort();
}

/** Every bookable day from today, with its free times (empty for a full or closed day). */
export function bookingDays(
  minutes: number,
  context: SlotContext,
): Array<{ date: string; slots: string[] }> {
  const today = localDateTime(context.now, context.timeZone).date;
  const days: Array<{ date: string; slots: string[] }> = [];
  for (let i = 0; i <= context.rules.horizon; i++) {
    const date = addLocalDays(today, i);
    days.push({ date, slots: daySlots(date, minutes, context) });
  }
  return days;
}

// ---------------------------------------------------------------------------------------------
// The visitor's request

export interface BookingRequest {
  /** Index of the service in the section's list. */
  service: number;
  date: string;
  time: string;
  name: string;
  email: string;
  phone?: string;
  message?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BOOKING_TEXTS = {
  fr: {
    name: "Indiquez votre nom.",
    email: "Indiquez une adresse e-mail valide, par exemple nom@exemple.fr.",
    phone: "Numéro de téléphone trop long.",
    message: "Message trop long (2 000 caractères au plus).",
  },
  en: {
    name: "Enter your name.",
    email: "Enter a valid e-mail address, for example name@example.com.",
    phone: "Phone number too long.",
    message: "Message too long (2,000 characters at most).",
  },
};

/** Checks the visitor's details; errors are keyed by field (`name`, `email`…). */
export function validateBookingContact(
  values: Record<string, unknown>,
  lang = "fr",
):
  | { ok: true; contact: Pick<BookingRequest, "name" | "email" | "phone" | "message"> }
  | { ok: false; errors: Record<string, string> } {
  const t = lang.startsWith("fr") ? BOOKING_TEXTS.fr : BOOKING_TEXTS.en;
  const text = (key: string) =>
    typeof values[key] === "string" ? (values[key] as string).trim() : "";
  const name = text("name");
  const email = text("email");
  const phone = text("phone");
  const message = text("message");
  const errors: Record<string, string> = {};
  if (!name || name.length > 120) errors.name = t.name;
  if (!EMAIL.test(email) || email.length > 200) errors.email = t.email;
  if (phone.length > 40) errors.phone = t.phone;
  if (message.length > 2000) errors.message = t.message;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    contact: { name, email, ...(phone ? { phone } : {}), ...(message ? { message } : {}) },
  };
}

// ---------------------------------------------------------------------------------------------
// Calendar file

const icsText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsTime = (instant: number) =>
  new Date(instant)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** An appointment as an `.ics` file (« Ajouter à mon agenda »). */
export function bookingIcs(event: {
  uid: string;
  start: number;
  end: number;
  summary: string;
  location?: string;
  description?: string;
}): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OpenFlow//Booking//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${icsText(event.uid)}`,
    `DTSTAMP:${icsTime(Date.now())}`,
    `DTSTART:${icsTime(event.start)}`,
    `DTEND:${icsTime(event.end)}`,
    `SUMMARY:${icsText(event.summary)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${icsText(event.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
