import {
  formatScheduled,
  formatTime,
  pageChanged,
  publishedAt,
  type SettingsDoc,
} from "@openflow/core";
import type { PageEntry, ReleaseEntry } from "./data.js";

/** What « Publier » would put online, counted the way the owner reads it. */
export interface PendingChanges {
  /** Pages of the site (not collection items) changed since they went online. */
  pages: number;
  /** Collection items (articles, events…) changed since they went online. */
  items: number;
  /** Common settings (menu, footer, theme, site) changed since the last publication. */
  settings: boolean;
  /** The number on the « Publier » button. */
  total: number;
}

/** Changes waiting for the next publication. Scheduled pages go online on their own: not counted. */
export function pendingChanges(
  pages: PageEntry[],
  releases: ReleaseEntry[],
  settings: Pick<SettingsDoc, "updatedAt"> | null | undefined,
): PendingChanges {
  const lastLive = releases.find((release) => release.status === "live");
  const changed = pages.filter((page) => !page.publishAt && pageChanged(page, releases));
  const main = changed.filter((page) => !page.collection).length;
  const settingsChanged = Boolean(
    lastLive && settings?.updatedAt && settings.updatedAt > publishedAt(lastLive),
  );
  return {
    pages: main,
    items: changed.length - main,
    settings: settingsChanged,
    total: changed.length + (settingsChanged ? 1 : 0),
  };
}

/** « 3 pages modifiées, 2 éléments de collection modifiés et réglages modifiés ». */
export function describeChanges(changes: PendingChanges): string {
  const s = (n: number) => (n > 1 ? "s" : "");
  const parts = [
    changes.pages > 0 ? `${changes.pages} page${s(changes.pages)} modifiée${s(changes.pages)}` : "",
    changes.items > 0
      ? `${changes.items} élément${s(changes.items)} de collection modifié${s(changes.items)}`
      : "",
    changes.settings ? "réglages modifiés" : "",
  ].filter(Boolean);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}`
    : (parts[0] ?? "");
}

/** Publication state of a page, as one status (Webflow's CMS vocabulary, simplified). */
export function pageStatus(page: PageEntry, releases: ReleaseEntry[]) {
  if (page.publishAt) {
    return {
      tone: "blue" as const,
      label: `Programmée le ${shortTime(page.publishAt)}`,
      title: `Mise en ligne toute seule le ${formatScheduled(page.publishAt)}`,
    };
  }
  if (page.status !== "published") {
    return { tone: "grey" as const, label: "Masquée", title: "N'apparaît pas sur le site" };
  }
  if (
    releases.some(
      (r) =>
        (r.status === "queued" || r.status === "building") && r.scheduledPages?.includes(page.id),
    )
  ) {
    return {
      tone: "blue" as const,
      label: "Mise en ligne…",
      title: "Publication programmée en cours",
    };
  }
  // Nothing online yet: the site status says it once, the rows stay quiet.
  if (!releases.some((release) => release.status === "live")) {
    return {
      tone: "grey" as const,
      label: "Brouillon",
      title: "Pas encore en ligne : publiez le site pour la mettre en ligne",
    };
  }
  if (pageChanged(page, releases)) {
    return {
      tone: "orange" as const,
      label: "Modifications non publiées",
      title: "Publiez pour mettre ces modifications en ligne",
    };
  }
  return { tone: "green" as const, label: "En ligne", title: "À jour sur le site" };
}

/** « 1 oct. à 9 h » (the year when it is not this one). */
function shortTime(iso: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
  return `${day} à ${formatTime(`${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`)}`;
}
