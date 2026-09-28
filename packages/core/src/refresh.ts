import { buildCollections } from "./collections.js";
import type { OpenFlowConfig } from "./config.js";
import type { Snapshot } from "./snapshot.js";

/**
 * A static site shows the day it was built: an agenda keeps a past event « à venir », the
 * structured data keeps an exceptional closure that is over. The daily refresh (`cmsDailyRefresh`)
 * rebuilds the online version (its snapshot, re-dated, never the drafts) when one of these dates
 * has passed since the build. This says which ones.
 */
export function outdatedSince(
  snapshot: Snapshot,
  config: Pick<OpenFlowConfig, "components" | "collections">,
  /** Day of the build and today (`YYYY-MM-DD`, the site's time). */
  period: { from: string; to: string },
): string[] {
  const { from, to } = period;
  if (from >= to) return [];
  const passed = (day: string | undefined) => Boolean(day && day >= from && day < to);
  const reasons: string[] = [];
  const collections = buildCollections(snapshot.pages, config);
  for (const [name, collection] of Object.entries(config.collections ?? {})) {
    if (collection.kind !== "event") continue;
    for (const entry of collections[name] ?? []) {
      if (passed(entry.endDate ?? entry.date)) reasons.push(`Événement passé : ${entry.title}`);
    }
  }
  for (const closure of snapshot.site.business?.closures ?? []) {
    if (passed(closure.to ?? closure.from)) {
      reasons.push(`Fermeture terminée : ${closure.label ?? closure.from}`);
    }
  }
  return reasons;
}
