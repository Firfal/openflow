import { pageChanged, publishedAt, type SettingsDoc } from "@openflow/core";
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
