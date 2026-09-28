import { createHash } from "node:crypto";
import {
  addLocalDays,
  BOOKING_RETENTION_MONTHS,
  BOOKING_SERVICES_PROP,
  type BookingDayDoc,
  type BookingDoc,
  type BookingRules,
  type BusyRange,
  bookingRulesOf,
  bookingTimeZone,
  COLLECTIONS,
  daySlots,
  FORM_SUBMISSION_LOG,
  isValidDate,
  localDateTime,
  pageAtPath,
  type Snapshot,
  validateBookingContact,
  walkComponents,
  zonedTime,
} from "@openflow/core";
import type { Firestore } from "firebase-admin/firestore";
import { MIN_FILL_MS, SPAM_SCORE, withinRateLimit } from "./forms.js";

/**
 * Appointments of the published site (`/cms/booking`, Hosting rewrite to `cmsBooking`):
 * `GET` gives the times already taken (no personal data), `POST` books one. A booking is accepted
 * only for a service of the section as it is published, at a time still free by its rules and the
 * business's hours, after the same spam defences as the forms. The time is taken in one Firestore
 * transaction on the day's document, so two visitors never get the same time.
 */

export interface BookingBody {
  page?: unknown;
  sectionId?: unknown;
  service?: unknown;
  date?: unknown;
  time?: unknown;
  values?: unknown;
  website?: unknown;
  elapsed?: unknown;
  token?: unknown;
  agent?: unknown;
}

export interface BookingDeps {
  db: Firestore;
  liveSnapshot(): Promise<Snapshot | undefined>;
  recaptchaScore?(token: string, siteKey: string): Promise<number | undefined>;
  /** E-mails the appointment to the owner; `false` when no e-mail service is configured. */
  notify?(booking: BookingDoc & { id: string }): Promise<boolean>;
  log?(message: string, data: Record<string, unknown>): void;
  salt: string;
  now?(): number;
}

export interface BookingResult {
  status: number;
  body: {
    ok: boolean;
    error?: string;
    errors?: Record<string, string>;
    /** The time was taken meanwhile: the visitor chooses another one. */
    taken?: boolean;
    booking?: { id: string; start: string; end: string; service: string };
  };
}

/** A booking section of the published site, in the page's language. */
export function findBooking(
  snapshot: Snapshot,
  page: string,
  sectionId: string,
): { rules: BookingRules; page: string; lang: string } | undefined {
  const found = pageAtPath(snapshot, page);
  if (!found) return undefined;
  const values = found.values ?? {};
  let rules: BookingRules | undefined;
  walkComponents(found.page.data, (item) => {
    const props = item.props as Record<string, unknown>;
    if (rules || props.id !== sectionId || !Array.isArray(props[BOOKING_SERVICES_PROP])) return;
    const services = (props[BOOKING_SERVICES_PROP] as Array<Record<string, unknown>>).map(
      (service, index) => {
        const name = values[`${sectionId}/${BOOKING_SERVICES_PROP}[${index}].name`];
        return typeof name === "string" && name ? { ...service, name } : service;
      },
    );
    rules = bookingRulesOf({ ...props, [BOOKING_SERVICES_PROP]: services });
  });
  if (!rules) return undefined;
  return {
    rules,
    page: page.endsWith("/") ? page : `${page}/`,
    lang: found.locale ?? snapshot.site.lang ?? "fr",
  };
}

/** The times taken from a local day on, for `days` days (no names, no contacts). */
export async function busyRanges(db: Firestore, from: string, days: number): Promise<BusyRange[]> {
  const refs = Array.from({ length: days }, (_, i) =>
    db.collection(COLLECTIONS.bookingDays).doc(addLocalDays(from, i)),
  );
  const docs = refs.length > 0 ? await db.getAll(...refs) : [];
  return docs.flatMap((doc) =>
    ((doc.data() as BookingDayDoc | undefined)?.busy ?? []).map(({ start, end }) => ({
      start,
      end,
    })),
  );
}

const TEXTS = {
  fr: {
    invalid: "Demande de rendez-vous invalide : rechargez la page.",
    gone: "Cette prise de rendez-vous n'existe plus : rechargez la page.",
    fields: "Vérifiez les champs signalés.",
    rate: "Trop de demandes : réessayez dans quelques minutes.",
    taken: "Ce créneau vient d'être pris ou n'est plus disponible : choisissez-en un autre.",
    spam: "Nous n'avons pas pu vérifier votre demande : réessayez, ou contactez-nous directement.",
  },
  en: {
    invalid: "Invalid booking request: reload the page.",
    gone: "This booking form no longer exists: reload the page.",
    fields: "Please check the highlighted fields.",
    rate: "Too many requests: try again in a few minutes.",
    taken: "This time was just taken or is no longer available: choose another one.",
    spam: "We could not verify your request: try again, or contact us directly.",
  },
};

/** Handles one booking (transport-agnostic, like the forms). */
export async function handleBooking(
  body: BookingBody,
  ip: string,
  deps: BookingDeps,
): Promise<BookingResult> {
  const page = typeof body.page === "string" ? body.page.slice(0, 500) : "";
  const sectionId = typeof body.sectionId === "string" ? body.sectionId.slice(0, 200) : "";
  const serviceIndex = Number(body.service);
  const date = typeof body.date === "string" ? body.date : "";
  const time = typeof body.time === "string" ? body.time : "";
  const values =
    body.values && typeof body.values === "object" && !Array.isArray(body.values)
      ? (body.values as Record<string, unknown>)
      : undefined;
  let t = TEXTS.fr;
  if (
    !page.startsWith("/") ||
    !sectionId ||
    !Number.isInteger(serviceIndex) ||
    !isValidDate(date) ||
    !/^\d{2}:\d{2}$/.test(time) ||
    !values
  ) {
    return { status: 400, body: { ok: false, error: t.invalid } };
  }
  // Bots: answered as a success, so they learn nothing, and dropped.
  const elapsed = Number(body.elapsed);
  if ((typeof body.website === "string" && body.website) || !(elapsed >= MIN_FILL_MS)) {
    deps.log?.("OpenFlow booking dropped (bot)", { page, sectionId });
    return { status: 200, body: { ok: true } };
  }
  const visitor = createHash("sha256").update(`${deps.salt}:${ip}`).digest("hex").slice(0, 40);
  if (!(await withinRateLimit(deps.db, visitor))) {
    return { status: 429, body: { ok: false, error: t.rate } };
  }
  const snapshot = await deps.liveSnapshot();
  const section = snapshot ? findBooking(snapshot, page, sectionId) : undefined;
  if (!snapshot || !section) return { status: 404, body: { ok: false, error: t.gone } };
  t = section.lang.startsWith("fr") ? TEXTS.fr : TEXTS.en;
  const service = section.rules.services[serviceIndex];
  if (!service) return { status: 400, body: { ok: false, error: t.invalid } };
  const contact = validateBookingContact(values, section.lang);
  if (!contact.ok) {
    return { status: 400, body: { ok: false, error: t.fields, errors: contact.errors } };
  }
  const siteKey = snapshot.integrations?.recaptchaSiteKey;
  if (siteKey && deps.recaptchaScore) {
    const score =
      typeof body.token === "string" && body.token
        ? await deps.recaptchaScore(body.token, siteKey)
        : 0;
    // A doubtful booking would hold a time: refused, with a way out.
    if (score !== undefined && score < SPAM_SCORE) {
      deps.log?.("OpenFlow booking refused (reCAPTCHA)", { page, score });
      return { status: 403, body: { ok: false, error: t.spam } };
    }
  }

  const business = snapshot.site.business;
  const timeZone = bookingTimeZone(business);
  const now = deps.now?.() ?? Date.now();
  const start = zonedTime(date, time, timeZone);
  const end = start + service.minutes * 60000;
  const expiresAt = new Date(end);
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + BOOKING_RETENTION_MONTHS);
  const db = deps.db;
  const dayRef = db.collection(COLLECTIONS.bookingDays).doc(date);
  const ref = db.collection(COLLECTIONS.bookings).doc();
  const booking: BookingDoc = {
    page: section.page,
    sectionId,
    service: service.name,
    duration: service.minutes,
    ...(service.price ? { price: service.price } : {}),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    date,
    time,
    timeZone,
    ...contact.contact,
    status: "confirmed",
    createdAt: new Date(now).toISOString(),
    ...(body.agent === true ? { agent: true } : {}),
    lang: section.lang,
    expiresAt,
  };
  const booked = await db.runTransaction(async (tx) => {
    const day = (await tx.get(dayRef)).data() as BookingDayDoc | undefined;
    const free = daySlots(date, service.minutes, {
      rules: section.rules,
      hours: business?.hours,
      closures: business?.closures,
      busy: day?.busy ?? [],
      now,
      timeZone,
    });
    if (!free.includes(time)) return false;
    const dayEnd = new Date(zonedTime(addLocalDays(date, 1), "00:00", timeZone));
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 7);
    tx.set(dayRef, {
      busy: [...(day?.busy ?? []), { id: ref.id, start: booking.start, end: booking.end }],
      expiresAt: dayEnd,
    } satisfies BookingDayDoc);
    tx.set(ref, booking);
    return true;
  });
  if (!booked) return { status: 409, body: { ok: false, error: t.taken, taken: true } };

  const mailed = await deps.notify?.({ ...booking, id: ref.id }).catch(() => false);
  // Without an e-mail service, the Cloud Monitoring alert of `openflow setup` warns the owner.
  if (!mailed) deps.log?.(FORM_SUBMISSION_LOG, { booking: ref.id, page: section.page });
  return {
    status: 200,
    body: {
      ok: true,
      booking: { id: ref.id, start: booking.start, end: booking.end, service: service.name },
    },
  };
}

/** `GET /cms/booking?from=YYYY-MM-DD&days=N`: the times taken, and the server's time. */
export async function handleBusy(
  query: Record<string, unknown>,
  deps: Pick<BookingDeps, "db" | "now" | "liveSnapshot">,
): Promise<{ status: number; body: { busy?: BusyRange[]; now?: string; error?: string } }> {
  const now = deps.now?.() ?? Date.now();
  const snapshot = await deps.liveSnapshot();
  const today = localDateTime(now, bookingTimeZone(snapshot?.site.business)).date;
  const from = typeof query.from === "string" && isValidDate(query.from) ? query.from : today;
  const days = Math.min(Math.max(Number(query.days) || 31, 1), 92);
  if (from < addLocalDays(today, -1) || from > addLocalDays(today, 92)) {
    return { status: 400, body: { error: "Période invalide." } };
  }
  return {
    status: 200,
    body: { busy: await busyRanges(deps.db, from, days), now: new Date(now).toISOString() },
  };
}

/** Plain-text and HTML e-mail sent to the owner for a new appointment. */
export function bookingEmail(booking: BookingDoc & { id: string }, adminUrl: string) {
  const when = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: booking.timeZone,
  }).format(new Date(booking.start));
  const lines = [
    `${booking.service} (${booking.duration} min${booking.price ? `, ${booking.price}` : ""})`,
    `Le ${when}`,
    `${booking.name} · ${booking.email}${booking.phone ? ` · ${booking.phone}` : ""}`,
    ...(booking.message ? [`Message : ${booking.message}`] : []),
  ];
  const escapeHtml = (text: string) =>
    text.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
  const link = `${adminUrl}?view=bookings`;
  return {
    subject: `Nouveau rendez-vous : ${booking.service}, ${when}`.slice(0, 150),
    text: `${lines.join("\n")}\n\nTous les rendez-vous : ${link}\n`,
    html: `<div style="font:15px/1.5 system-ui,sans-serif;color:#18181b">${lines
      .map((line) => `<p style="margin:0 0 8px">${escapeHtml(line).replace(/\n/g, "<br>")}</p>`)
      .join(
        "",
      )}<p style="margin:24px 0 0;color:#6b6b74"><a href="${escapeHtml(link)}">Tous les rendez-vous</a></p></div>`,
  };
}
