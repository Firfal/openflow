import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
  buildCollections,
  buildLlmsTxt,
  createSnapshot,
  dateField,
  defineConfig,
  imageField,
  pageJsonLd,
  parsePrice,
  parseTime,
  sortEntries,
  validateConfig,
} from "../src/index.js";

const item = (type: string, props: Record<string, unknown>) =>
  ({ root: { props: {} }, content: [{ type, props: { id: "i", ...props } }] }) as Data;

const config = defineConfig({
  site: { name: "Atelier", lang: "fr" },
  components: {
    Event: {
      label: "Événement",
      fields: {
        title: { type: "text", contentEditable: true },
        date: dateField({ label: "Date" }),
        end: dateField({ label: "Fin" }),
        time: { type: "text" },
        place: { type: "text" },
        price: { type: "text" },
        cover: imageField({ label: "Image" }),
      },
      defaultProps: { title: "", date: "", end: "", time: "", place: "", price: "", cover: null },
      render: () => null as never,
    },
    Service: {
      label: "Prestation",
      fields: {
        title: { type: "text", contentEditable: true },
        summary: { type: "textarea" },
        price: { type: "number" },
      },
      defaultProps: { title: "", summary: "", price: 0 },
      render: () => null as never,
    },
    Product: {
      label: "Produit",
      fields: { title: { type: "text" }, price: { type: "text" } },
      defaultProps: { title: "", price: "" },
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
      timeField: "time",
      locationField: "place",
      priceField: "price",
      imageField: "cover",
    },
    prestations: {
      label: "Prestations",
      path: "prestations",
      component: "Service",
      kind: "service",
      descriptionField: "summary",
      priceField: "price",
    },
    boutique: {
      label: "Boutique",
      path: "boutique",
      component: "Product",
      kind: "product",
      priceField: "price",
    },
  },
});

const pages = [
  {
    id: "home",
    slug: "",
    title: "Accueil",
    status: "published" as const,
    data: item("Service", { title: "x" }),
  },
  {
    id: "stage",
    slug: "evenements/stage",
    title: "Stage de poterie",
    status: "published" as const,
    collection: "evenements",
    data: item("Event", {
      title: "Stage de poterie",
      date: "2026-10-10",
      end: "2026-10-11",
      time: "9 h 30",
      place: "Atelier du quai",
      price: "120 €",
      cover: { src: "https://cdn/stage.webp", alt: "Tour de potier" },
    }),
  },
  {
    id: "portes",
    slug: "evenements/portes-ouvertes",
    title: "Portes ouvertes",
    status: "published" as const,
    collection: "evenements",
    data: item("Event", {
      title: "Portes ouvertes",
      date: "2026-10-04",
      time: "10:00",
      price: "Gratuit",
    }),
  },
  {
    id: "passe",
    slug: "evenements/marche-de-noel",
    title: "Marché de Noël",
    status: "published" as const,
    collection: "evenements",
    data: item("Event", { title: "Marché de Noël", date: "2025-12-12" }),
  },
  {
    id: "cours",
    slug: "prestations/cours",
    title: "Cours particulier",
    status: "published" as const,
    collection: "prestations",
    data: item("Service", { title: "Cours particulier", summary: "Une heure au tour.", price: 45 }),
  },
  {
    id: "bol",
    slug: "boutique/bol",
    title: "Bol émaillé",
    status: "published" as const,
    collection: "boutique",
    data: item("Product", { title: "Bol émaillé", price: "24,50 €" }),
  },
];

const snapshot = createSnapshot({
  releaseId: "r1",
  createdAt: "2026-09-28T08:00:00Z",
  settings: {
    site: {
      name: "Atelier",
      lang: "fr",
      url: "https://atelier.fr",
      business: { type: "Store", street: "3 quai des Arts", postalCode: "69001", city: "Lyon" },
    },
    values: {},
  },
  pages: pages.map((p) => ({ ...p, seo: {} })),
});
const page = (id: string) => snapshot.pages.find((p) => p.id === id)!;

describe("typed collections", () => {
  it("reads prices and times as the owner writes them", () => {
    expect(parsePrice("25")).toEqual({ price: 25, currency: "EUR" });
    expect(parsePrice("12,50 €")).toEqual({ price: 12.5, currency: "EUR" });
    expect(parsePrice("À partir de 1 200 €")).toEqual({ price: 1200, currency: "EUR" });
    expect(parsePrice("Gratuit")).toEqual({ price: 0, currency: "EUR" });
    expect(parsePrice("$30")).toEqual({ price: 30, currency: "USD" });
    expect(parsePrice("Sur devis")).toBeUndefined();
    expect(parseTime("10:00")).toBe("10:00");
    expect(parseTime("9 h 30")).toBe("09:30");
    expect(parseTime("14h")).toBe("14:00");
    expect(parseTime("le matin")).toBeUndefined();
    expect(parseTime("25:00")).toBeUndefined();
  });

  it("lists coming events first, soonest first, then past ones", () => {
    const events = buildCollections(snapshot.pages, config).evenements ?? [];
    const sorted = sortEntries(events, config.collections.evenements, "2026-09-28");
    expect(sorted.map((e) => e.id)).toEqual(["portes", "stage", "passe"]);
    expect(sorted[1]).toMatchObject({
      date: "2026-10-10",
      endDate: "2026-10-11",
      time: "9 h 30",
      location: "Atelier du quai",
      price: "120 €",
    });
    // The last day counts: an event over several days stays « coming » until it ends.
    expect(sortEntries(events, config.collections.evenements, "2026-10-11")[0]?.id).toBe("stage");
  });

  it("describes events, services and products for Google and AI assistants", () => {
    const [event] = pageJsonLd(snapshot, page("stage"), config);
    expect(event).toMatchObject({
      "@type": "Event",
      name: "Stage de poterie",
      startDate: "2026-10-10T09:30",
      endDate: "2026-10-11",
      eventStatus: "https://schema.org/EventScheduled",
      location: { "@type": "Place", name: "Atelier du quai", address: "Atelier du quai" },
      organizer: { "@id": "https://atelier.fr/#business" },
      offers: { "@type": "Offer", price: 120, priceCurrency: "EUR" },
      image: ["https://cdn/stage.webp"],
      url: "https://atelier.fr/evenements/stage/",
    });
    const [free] = pageJsonLd(snapshot, page("portes"), config);
    expect(free).toMatchObject({ isAccessibleForFree: true, offers: { price: 0 } });
    // Without a place of its own, the event is at the business's address.
    expect((free as any).location).toMatchObject({
      name: "Atelier",
      address: { "@type": "PostalAddress", addressLocality: "Lyon" },
    });
    const [service] = pageJsonLd(snapshot, page("cours"), config);
    expect(service).toMatchObject({
      "@type": "Service",
      description: "Une heure au tour.",
      provider: { "@id": "https://atelier.fr/#business" },
      areaServed: "Lyon",
      offers: { price: 45, priceCurrency: "EUR" },
    });
    const [product] = pageJsonLd(snapshot, page("bol"), config);
    expect(product).toMatchObject({ "@type": "Product", offers: { price: 24.5 } });
  });

  it("gives assistants the day, time, place and price in llms.txt", () => {
    const llms = buildLlmsTxt(snapshot, config);
    expect(llms).toContain(
      "- [Stage de poterie](https://atelier.fr/evenements/stage/) (10 octobre 2026 – 11 octobre 2026 à 9 h 30, Atelier du quai, 120 €)",
    );
  });

  it("checks the fields a typed collection names", () => {
    const broken = defineConfig({
      ...config,
      collections: {
        evenements: {
          label: "Événements",
          path: "evenements",
          component: "Event",
          kind: "event",
          timeField: "cover",
          priceField: "nope",
        },
      },
    });
    const messages = validateConfig(broken, "openflow.config.tsx").map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("l'heure « cover » doit être un champ texte"),
        expect.stringContaining("le prix « nope » n'est pas un champ"),
        expect.stringContaining("a besoin d'un `dateField`"),
      ]),
    );
  });
});
