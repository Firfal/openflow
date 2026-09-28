import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
  createSnapshot,
  dateField,
  defineConfig,
  outdatedSince,
  publishedAt,
} from "../src/index.js";

const config = defineConfig({
  site: { name: "Atelier", lang: "fr" },
  components: {
    Event: {
      fields: { title: { type: "text" }, date: dateField(), end: dateField() },
      defaultProps: { title: "", date: "", end: "" },
      render: () => null as never,
    },
  },
  collections: {
    evenements: {
      label: "Événements",
      path: "evenements",
      component: "Event",
      kind: "event",
      dateField: "date",
      endDateField: "end",
    },
  },
});

const event = (id: string, title: string, date: string, end = "") => ({
  id,
  slug: `evenements/${id}`,
  title,
  status: "published" as const,
  seo: {},
  collection: "evenements",
  data: {
    root: { props: {} },
    content: [{ type: "Event", props: { id: "e", title, date, end } }],
  } as Data,
});

const snapshot = createSnapshot({
  releaseId: "r1",
  createdAt: "2026-10-03T08:00:00Z",
  settings: {
    site: {
      name: "Atelier",
      lang: "fr",
      business: {
        closures: [
          { from: "2026-10-01", to: "2026-10-04", label: "Inventaire" },
          { from: "2026-12-24", to: "2026-12-26" },
        ],
      },
    },
    values: {},
  },
  pages: [
    event("portes", "Portes ouvertes", "2026-10-04"),
    event("salon", "Salon", "2026-10-03", "2026-10-05"),
    event("noel", "Marché de Noël", "2026-12-12"),
  ],
});

describe("daily refresh", () => {
  it("rebuilds only when an event or a closure of the online version is over", () => {
    // Built on 3 October: nothing has passed yet that day.
    expect(outdatedSince(snapshot, config, { from: "2026-10-03", to: "2026-10-03" })).toEqual([]);
    // On the 5th: the open day (4th) and the closure (to the 4th) are over, the fair ends today.
    expect(outdatedSince(snapshot, config, { from: "2026-10-03", to: "2026-10-05" })).toEqual([
      "Événement passé : Portes ouvertes",
      "Fermeture terminée : Inventaire",
    ]);
    // On the 6th, the fair (to the 5th) too.
    expect(outdatedSince(snapshot, config, { from: "2026-10-03", to: "2026-10-06" })).toContain(
      "Événement passé : Salon",
    );
  });

  it("compares the owner's drafts to the date of the content, not of the rebuild", () => {
    expect(publishedAt({ createdAt: "2026-10-05T02:20:00Z" })).toBe("2026-10-05T02:20:00Z");
    expect(
      publishedAt({ createdAt: "2026-10-05T02:20:00Z", contentAt: "2026-10-03T08:00:00Z" }),
    ).toBe("2026-10-03T08:00:00Z");
  });
});
