import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
  bookingComponentOf,
  bookingDays,
  bookingIcs,
  bookingRuleFields,
  bookingRulesOf,
  bookingSectionsOf,
  bookingServicesField,
  bookingTimeZone,
  buildLlmsTxt,
  createSnapshot,
  daySlots,
  defineConfig,
  localDateTime,
  pageJsonLd,
  type SlotContext,
  validateBookingContact,
  zonedTime,
} from "../src/index.js";

const PARIS = "Europe/Paris";

describe("time zones", () => {
  it("converts the business's local times, summer and winter", () => {
    expect(new Date(zonedTime("2026-10-06", "09:00", PARIS)).toISOString()).toBe(
      "2026-10-06T07:00:00.000Z",
    );
    expect(new Date(zonedTime("2026-12-01", "09:00", PARIS)).toISOString()).toBe(
      "2026-12-01T08:00:00.000Z",
    );
    // The day the clocks go back (25 October 2026).
    expect(new Date(zonedTime("2026-10-25", "14:30", PARIS)).toISOString()).toBe(
      "2026-10-25T13:30:00.000Z",
    );
    expect(localDateTime(Date.parse("2026-10-06T22:30:00Z"), PARIS)).toEqual({
      date: "2026-10-07",
      time: "00:30",
    });
    expect(bookingTimeZone({ country: "BE" })).toBe("Europe/Brussels");
    expect(bookingTimeZone(undefined)).toBe(PARIS);
  });
});

const rules = bookingRulesOf({
  bookingServices: [
    { name: "Coupe", duration: "60", price: "35 €" },
    { name: "", duration: "30" },
    { name: "Barbe", duration: "999" },
  ],
  bookingStep: "30",
  bookingNotice: "1",
  bookingHorizon: "14",
  bookingBuffer: "0",
});

const context = (extra: Partial<SlotContext> = {}): SlotContext => ({
  rules,
  hours: { tu: [{ opens: "09:00", closes: "12:00" }] },
  closures: [{ from: "2026-10-20", to: "2026-10-21", label: "Congés" }],
  busy: [],
  // Monday 5 October 2026, 10:00 in Paris.
  now: Date.parse("2026-10-05T08:00:00Z"),
  timeZone: PARIS,
  ...extra,
});

describe("free times", () => {
  it("reads the section's rules, invalid values falling back to the defaults", () => {
    expect(rules.services.map((s) => [s.name, s.minutes])).toEqual([
      ["Coupe", 60],
      ["Barbe", 30],
    ]);
    expect(rules).toMatchObject({ step: 30, notice: 1, horizon: 14, buffer: 0 });
    expect(bookingRulesOf({})).toMatchObject({ services: [], step: 30, notice: 2, horizon: 30 });
  });

  it("offers the times of the opening hours where the service fits", () => {
    expect(daySlots("2026-10-06", 60, context())).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
    ]);
    // Closed on Mondays (no hours), on an exceptional closure, beyond the horizon.
    expect(daySlots("2026-10-12", 60, context())).toEqual([]);
    expect(daySlots("2026-10-20", 60, context())).toEqual([]);
    expect(daySlots("2026-10-27", 60, context())).toEqual([]);
  });

  it("never offers a taken time, with the pause between appointments", () => {
    const busy = [{ start: "2026-10-06T08:00:00.000Z", end: "2026-10-06T09:00:00.000Z" }];
    expect(daySlots("2026-10-06", 60, context({ busy }))).toEqual(["09:00", "11:00"]);
    const paused = { ...rules, buffer: 15 };
    expect(daySlots("2026-10-06", 60, context({ busy, rules: paused }))).toEqual([]);
  });

  it("keeps the notice before an appointment", () => {
    // Tuesday 09:20 in Paris, 1 hour of notice: 10:30 at the earliest.
    const now = Date.parse("2026-10-06T07:20:00Z");
    expect(daySlots("2026-10-06", 60, context({ now }))).toEqual(["10:30", "11:00"]);
    const days = bookingDays(60, context({ now }));
    expect(days).toHaveLength(15);
    expect(days.filter((day) => day.slots.length > 0).map((day) => day.date)).toEqual([
      "2026-10-06",
      "2026-10-13",
    ]);
  });
});

describe("booking section", () => {
  const Booking = {
    fields: { bookingServices: bookingServicesField(), ...bookingRuleFields() },
    render: () => null,
  };

  it("is found in the config and in a page", () => {
    expect(bookingComponentOf({ Hero: { fields: {} }, Booking })).toBe("Booking");
    const data = {
      root: { props: {} },
      content: [
        { type: "Hero", props: { id: "h" } },
        { type: "Booking", props: { id: "rdv", bookingServices: [] } },
      ],
    } as Data;
    expect(bookingSectionsOf(data)).toEqual(["rdv"]);
  });

  it("checks the visitor's details", () => {
    expect(validateBookingContact({ name: " Léa ", email: "lea@exemple.fr", phone: "" })).toEqual({
      ok: true,
      contact: { name: "Léa", email: "lea@exemple.fr" },
    });
    const refused = validateBookingContact({ name: "", email: "lea@" }, "en");
    expect(refused.ok).toBe(false);
    expect(Object.keys((refused as { errors: object }).errors)).toEqual(["name", "email"]);
  });

  it("writes a calendar file", () => {
    const ics = bookingIcs({
      uid: "abc@site",
      start: Date.parse("2026-10-06T07:00:00Z"),
      end: Date.parse("2026-10-06T08:00:00Z"),
      summary: "Coupe, Salon Léa",
      location: "3 rue du Port; Nantes",
    });
    expect(ics).toContain("DTSTART:20261006T070000Z\r\n");
    expect(ics).toContain("DTEND:20261006T080000Z\r\n");
    expect(ics).toContain("SUMMARY:Coupe\\, Salon Léa\r\n");
    expect(ics).toContain("LOCATION:3 rue du Port\\; Nantes\r\n");
  });
});

describe("booking, for Google and AI assistants", () => {
  it("offers to book from the business's data and llms.txt", () => {
    const snapshot = createSnapshot({
      releaseId: "r1",
      settings: {
        site: {
          name: "Salon Léa",
          lang: "fr",
          url: "https://salon-lea.fr",
          business: { phone: "02 40 00 00 00", city: "Nantes" },
        },
        values: {},
      },
      pages: [
        {
          id: "accueil",
          slug: "",
          title: "Accueil",
          status: "published",
          seo: {},
          data: { root: { props: {} }, content: [] },
        },
        {
          id: "rdv",
          slug: "rendez-vous",
          title: "Rendez-vous",
          status: "published",
          seo: {},
          data: {
            root: { props: {} },
            content: [{ type: "Booking", props: { id: "b", bookingServices: [] } }],
          } as Data,
        },
      ],
    });
    const config = defineConfig({ site: { name: "Salon Léa" }, components: {} });
    const business = pageJsonLd(snapshot, snapshot.pages[0]!, config).find(
      (item) => item["@type"] === "LocalBusiness",
    );
    expect(business?.potentialAction).toMatchObject({
      "@type": "ReserveAction",
      target: { urlTemplate: "https://salon-lea.fr/rendez-vous/" },
    });
    expect(buildLlmsTxt(snapshot)).toContain(
      "- Prendre rendez-vous en ligne : https://salon-lea.fr/rendez-vous/",
    );
  });
});
