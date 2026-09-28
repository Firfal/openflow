"use client";

import { STATS_OPT_OUT_KEY, STATS_PATH } from "@openflow/core/stats";
import { usePathname } from "next/navigation.js";
import { useEffect, useRef } from "react";

/**
 * Audience measurement without cookies (Statistiques in the admin): one beacon per page view,
 * holding the page's address, where the visit comes from (first page only) and the width of the
 * window. No cookie, no identifier, nothing stored in the browser. Rendered by
 * `createOpenFlowLayout` unless the owner turned the measurement off.
 *
 * Nothing is sent when the visitor asked not to be followed (« Ne pas suivre », Global Privacy
 * Control), for automated browsers, and on devices where the visitor (the privacy policy's switch)
 * or the owner (Statistiques) stopped the counting (`cms-stats-optout`).
 */

function endpoint(): string {
  if (process.env.NEXT_PUBLIC_CMS_EMULATORS === "1") {
    const region = process.env.NEXT_PUBLIC_CMS_REGION || "europe-west1";
    return `http://${window.location.hostname}:5001/demo-openflow/${region}/cmsPageView`;
  }
  return STATS_PATH;
}

/** The browser asks not to be followed (Do Not Track, Global Privacy Control). */
function doNotTrack(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return Boolean(nav.globalPrivacyControl) || nav.doNotTrack === "1";
}

function optedOut(): boolean {
  try {
    return window.localStorage.getItem(STATS_OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function refused(): boolean {
  // `next dev` without the emulators has no function to count the views.
  if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_CMS_EMULATORS !== "1") {
    return true;
  }
  return navigator.webdriver || doNotTrack() || optedOut();
}

/**
 * The visitor's switch of the privacy policy (`statsOptOutProps` of `@openflow/core`): its status
 * and button take the texts matching the visitor's choice.
 */
function showOptOut() {
  const blocked = doNotTrack();
  const excluded = optedOut();
  for (const status of document.querySelectorAll<HTMLElement>("[data-of-stats-status]")) {
    const text = blocked
      ? status.dataset.refused
      : excluded
        ? status.dataset.excluded
        : status.dataset.counted;
    if (text && status.textContent !== text) status.textContent = text;
  }
  for (const button of document.querySelectorAll<HTMLElement>("[data-of-stats-optout]")) {
    button.hidden = blocked;
    const text = excluded ? button.dataset.resume : button.dataset.stop;
    if (text && button.textContent !== text) button.textContent = text;
  }
}

function toggleOptOut(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest("[data-of-stats-optout]")) return;
  try {
    if (optedOut()) window.localStorage.removeItem(STATS_OPT_OUT_KEY);
    else window.localStorage.setItem(STATS_OPT_OUT_KEY, "1");
  } catch {
    // Blocked storage: the choice cannot be kept.
  }
  showOptOut();
}

/** A reload or a move in the history is not a new visit. */
function revisited(): boolean {
  const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return navigation?.type === "reload" || navigation?.type === "back_forward";
}

function send(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const url = endpoint();
  // text/plain keeps the request simple: no CORS preflight, one request per view.
  const blob = new Blob([body], { type: "text/plain" });
  if (navigator.sendBeacon?.(url, blob)) return;
  fetch(url, { method: "POST", body, keepalive: true, mode: "no-cors" }).catch(() => {});
}

type ShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean };
type EventEntry = PerformanceEntry & { interactionId?: number };

/** Observes a kind of performance entry; nothing in browsers that do not support it. */
function observe<T extends PerformanceEntry>(
  type: string,
  onEntries: (entries: T[]) => void,
  options: Record<string, unknown> = {},
) {
  try {
    new PerformanceObserver((list) => onEntries(list.getEntries() as T[])).observe({
      type,
      buffered: true,
      ...options,
    } as PerformanceObserverInit);
  } catch {
    // Not supported (Safari has no LCP or INP yet): that measure is left out.
  }
}

/**
 * Core Web Vitals of the page load, sent once when the visitor leaves the page (Google's
 * definitions, simplified): LCP, the largest paint before any input; CLS, the worst window of
 * layout shifts; INP, the slowest interaction (none when the visitor did not interact).
 */
function watchVitals(path: string) {
  let lcp = 0;
  let cls = 0;
  let inp = 0;
  let interacted = false;
  let windowValue = 0;
  let windowStart = 0;
  let windowLast = 0;
  observe<PerformanceEntry>("largest-contentful-paint", (entries) => {
    const latest = entries.at(-1);
    if (latest) lcp = latest.startTime;
  });
  observe<ShiftEntry>("layout-shift", (entries) => {
    for (const entry of entries) {
      if (entry.hadRecentInput) continue;
      const sameWindow =
        windowValue > 0 &&
        entry.startTime - windowLast < 1000 &&
        entry.startTime - windowStart < 5000;
      windowValue = sameWindow ? windowValue + entry.value : entry.value;
      if (!sameWindow) windowStart = entry.startTime;
      windowLast = entry.startTime;
      cls = Math.max(cls, windowValue);
    }
  });
  observe<EventEntry>(
    "event",
    (entries) => {
      for (const entry of entries) if (entry.interactionId) inp = Math.max(inp, entry.duration);
    },
    { durationThreshold: 40 },
  );
  const onInput = () => {
    interacted = true;
  };
  addEventListener("pointerdown", onInput, { once: true, capture: true });
  addEventListener("keydown", onInput, { once: true, capture: true });
  let sent = false;
  const flush = () => {
    // Nothing once the visitor stopped the counting (privacy policy) while on the page.
    if (sent || optedOut() || (!lcp && !interacted)) return;
    sent = true;
    send({
      p: path,
      v: {
        ...(lcp ? { lcp: Math.round(lcp) } : {}),
        cls: Math.round(cls * 1000) / 1000,
        // An interaction faster than the observer's threshold is a fast one.
        ...(interacted ? { inp: Math.round(inp || 16) } : {}),
      },
    });
  };
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  addEventListener("pagehide", flush);
}

export function OpenFlowStats() {
  const pathname = usePathname();
  const first = useRef(true);
  const last = useRef<string>(undefined);

  useEffect(() => {
    document.addEventListener("click", toggleOptOut);
    return () => document.removeEventListener("click", toggleOptOut);
  }, []);

  // The switch of the privacy policy, on each page shown.
  useEffect(() => {
    if (pathname) showOptOut();
  }, [pathname]);

  useEffect(() => {
    // Once per address (React runs effects twice in development).
    if (!pathname || last.current === pathname || refused()) return;
    last.current = pathname;
    const isFirst = first.current;
    first.current = false;
    if (!isFirst) {
      send({ p: window.location.pathname, w: window.innerWidth });
      return;
    }
    let external = true;
    try {
      external = !document.referrer || new URL(document.referrer).host !== window.location.host;
    } catch {
      external = true;
    }
    const entry = external && !revisited();
    // The speed of this page load (one measure per load, sent when the visitor leaves).
    watchVitals(window.location.pathname);
    send({
      p: window.location.pathname,
      w: window.innerWidth,
      ...(entry
        ? {
            e: true,
            r: document.referrer,
            u: new URLSearchParams(window.location.search).get("utm_source") ?? undefined,
          }
        : {}),
    });
    // One beacon per address shown (client-side navigations included).
  }, [pathname]);

  return null;
}
