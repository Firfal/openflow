import { formatTime } from "./business.js";

/**
 * Scheduled publication: a page (an article, a promotion…) goes online at the time its owner
 * chose, on its own. The online site gets this page as it is at that time, and nothing else: the
 * owner's other drafts stay drafts.
 */

/** Scheduled times are checked every quarter of an hour. */
export const SCHEDULE_STEP_MINUTES = 15;

/** An ISO time with its time zone: `2026-10-01T07:00:00Z`, `2026-10-01T09:00:00+02:00`. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** A valid scheduled time: an ISO time (with its time zone) in the future, less than a year away. */
export function isValidPublishAt(value: unknown, now = Date.now()): value is string {
  if (typeof value !== "string" || !ISO_TIME.test(value)) return false;
  const at = Date.parse(value);
  return Number.isFinite(at) && at > now && at < now + 366 * 24 * 3600 * 1000;
}

/** Pages whose scheduled time has come (`publishAt` at or before `now`), oldest first. */
export function duePages<T extends { id: string; publishAt?: string }>(
  pages: T[],
  now: string,
): T[] {
  return pages
    .filter((page) => page.publishAt && Date.parse(page.publishAt) <= Date.parse(now))
    .sort((a, b) => Date.parse(a.publishAt as string) - Date.parse(b.publishAt as string));
}

/**
 * « jeudi 1er octobre 2026 à 9 h » (French, the admin's language), in the owner's time zone (the
 * browser's), or the given one.
 */
export function formatScheduled(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      ...(timeZone ? { timeZone } : {}),
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const day = parts.day === "1" ? "1er" : parts.day;
  return `${parts.weekday} ${day} ${parts.month} ${parts.year} à ${formatTime(`${parts.hour}:${parts.minute}`)}`;
}
