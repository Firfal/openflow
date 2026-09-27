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
 * Control), for automated browsers, and on the owner's devices (`cms-stats-optout`).
 */

function endpoint(): string {
  if (process.env.NEXT_PUBLIC_CMS_EMULATORS === "1") {
    const region = process.env.NEXT_PUBLIC_CMS_REGION || "europe-west1";
    return `http://${window.location.hostname}:5001/demo-openflow/${region}/cmsPageView`;
  }
  return STATS_PATH;
}

function refused(): boolean {
  // `next dev` without the emulators has no function to count the views.
  if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_CMS_EMULATORS !== "1") {
    return true;
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.webdriver || nav.globalPrivacyControl || nav.doNotTrack === "1") return true;
  try {
    return window.localStorage.getItem(STATS_OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
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

export function OpenFlowStats() {
  const pathname = usePathname();
  const first = useRef(true);
  const last = useRef<string>(undefined);

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
