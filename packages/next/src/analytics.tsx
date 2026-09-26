"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Google Analytics 4 with prior consent, as the CNIL requires: nothing is loaded and no cookie is
 * set before the visitor clicks « Accepter ». « Refuser » is as visible as « Accepter », the choice
 * is kept 6 months, and a small « Cookies » button lets the visitor change it at any time.
 * Rendered by `createOpenFlowLayout` when the owner filled in the measurement ID (G-…).
 */

const STORAGE_KEY = "openflow-consent";
const MAX_AGE_MS = 182 * 24 * 3600 * 1000;

type Choice = "granted" | "denied";

const TEXTS = {
  fr: {
    text: "Nous mesurons l'audience du site avec Google Analytics (cookies) pour savoir quelles pages sont lues. Vous pouvez accepter ou refuser.",
    accept: "Accepter",
    refuse: "Refuser",
    manage: "Cookies",
    label: "Choix des cookies",
  },
  en: {
    text: "We measure the site's audience with Google Analytics (cookies) to know which pages are read. You can accept or refuse.",
    accept: "Accept",
    refuse: "Refuse",
    manage: "Cookies",
    label: "Cookie choice",
  },
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function readChoice(): Choice | undefined {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as {
      choice?: Choice;
      at?: number;
    } | null;
    if (stored?.choice && stored.at && Date.now() - stored.at < MAX_AGE_MS) return stored.choice;
  } catch {
    // Blocked storage: the banner is shown again.
  }
  return undefined;
}

function saveChoice(choice: Choice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, at: Date.now() }));
  } catch {
    // Blocked storage: the choice lasts for this visit.
  }
}

let loaded = false;
function loadAnalytics(measurementId: string) {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // biome-ignore lint/complexity/noArguments: gtag expects the arguments object.
    window.dataLayer?.push(arguments);
  };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  if (loaded) {
    window.gtag("consent", "update", { analytics_storage: "granted" });
    return;
  }
  loaded = true;
  window.gtag("js", new Date());
  window.gtag("config", measurementId);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);
}

/** Removes the Google Analytics cookies after a refusal. */
function clearAnalyticsCookies() {
  window.gtag?.("consent", "update", { analytics_storage: "denied" });
  const domain = window.location.hostname.split(".").slice(-2).join(".");
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name || !/^_ga/.test(name)) continue;
    for (const scope of ["", `;domain=${window.location.hostname}`, `;domain=.${domain}`]) {
      // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is missing in Firefox and Safari.
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/${scope}`;
    }
  }
}

const CSS = `
.of-consent{position:fixed;z-index:2147483000;inset:auto 16px 16px 16px;max-width:420px;margin-left:auto;padding:16px;border-radius:12px;background:#fff;color:#18181b;box-shadow:0 2px 8px rgb(0 0 0/.12),0 16px 40px rgb(0 0 0/.18);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.of-consent p{margin:0 0 12px}
.of-consent__actions{display:flex;gap:8px;justify-content:flex-end}
.of-consent button{min-height:40px;padding:0 16px;border-radius:8px;border:1px solid #18181b;font:inherit;font-weight:600;cursor:pointer}
.of-consent__refuse{background:#fff;color:#18181b}
.of-consent__accept{background:#18181b;color:#fff}
.of-consent button:focus-visible,.of-consent-manage:focus-visible{outline:2px solid #2f5bff;outline-offset:2px}
.of-consent-manage{position:fixed;z-index:2147483000;left:12px;bottom:12px;padding:4px 10px;border:1px solid rgb(0 0 0/.15);border-radius:999px;background:rgb(255 255 255/.92);color:#3f3f46;font:12px/1.5 system-ui,sans-serif;cursor:pointer}
@media (prefers-color-scheme:dark){.of-consent{background:#1c1c1f;color:#f4f4f5}.of-consent__refuse{background:#1c1c1f;color:#f4f4f5;border-color:#f4f4f5}.of-consent__accept{background:#f4f4f5;color:#18181b;border-color:#f4f4f5}}
@media print{.of-consent,.of-consent-manage{display:none}}
`;

export function OpenFlowAnalytics({ measurementId }: { measurementId: string }) {
  const [choice, setChoice] = useState<Choice | undefined | "unknown">("unknown");
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const t = TEXTS[lang];

  useEffect(() => {
    setLang(document.documentElement.lang.startsWith("en") ? "en" : "fr");
    const stored = readChoice();
    setChoice(stored);
    if (stored === "granted") loadAnalytics(measurementId);
    if (!stored) setOpen(true);
  }, [measurementId]);

  const decide = useCallback(
    (next: Choice) => {
      saveChoice(next);
      setChoice(next);
      setOpen(false);
      if (next === "granted") loadAnalytics(measurementId);
      else clearAnalyticsCookies();
    },
    [measurementId],
  );

  if (choice === "unknown") return null;
  return (
    <>
      <style>{CSS}</style>
      {open ? (
        <section className="of-consent" role="dialog" aria-live="polite" aria-label={t.label}>
          <p>{t.text}</p>
          <div className="of-consent__actions">
            <button type="button" className="of-consent__refuse" onClick={() => decide("denied")}>
              {t.refuse}
            </button>
            <button type="button" className="of-consent__accept" onClick={() => decide("granted")}>
              {t.accept}
            </button>
          </div>
        </section>
      ) : (
        <button type="button" className="of-consent-manage" onClick={() => setOpen(true)}>
          {t.manage}
        </button>
      )}
    </>
  );
}
