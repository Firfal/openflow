import { type BookingDoc, createSnapshot } from "@openflow/core";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { bookingEmail, findBooking, handleBooking, handleBusy } from "../src/booking.js";

/** Minimal in-memory Firestore: documents, transactions and `getAll`. */
function memoryDb() {
  const store = new Map<string, Record<string, unknown>>();
  let next = 0;
  const ref = (path: string) => ({ path, id: path.split("/").at(-1) as string });
  const db = {
    store,
    collection: (name: string) => ({
      doc: (id?: string) => ref(`${name}/${id ?? `auto${++next}`}`),
    }),
    getAll: async (...refs: Array<{ path: string }>) =>
      refs.map((r) => ({ data: () => store.get(r.path) })),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (r: { path: string }) => ({ data: () => store.get(r.path) }),
        set: (r: { path: string }, data: Record<string, unknown>) => store.set(r.path, data),
        update: (r: { path: string }, data: Record<string, unknown>) =>
          store.set(r.path, { ...store.get(r.path), ...data }),
      }),
  };
  return db;
}

const snapshot = createSnapshot({
  releaseId: "r1",
  settings: {
    site: {
      name: "Salon Léa",
      lang: "fr",
      locales: ["en"],
      business: {
        country: "FR",
        hours: { tu: [{ opens: "09:00", closes: "12:00" }] },
      },
    },
    values: {},
  },
  pages: [
    {
      id: "rdv",
      slug: "rendez-vous",
      title: "Rendez-vous",
      status: "published",
      seo: {},
      data: {
        root: { props: {} },
        content: [
          {
            type: "Booking",
            props: {
              id: "booking-1",
              bookingServices: [{ name: "Coupe", duration: "60", price: "35 €" }],
              bookingStep: "30",
              bookingNotice: "1",
              bookingHorizon: "30",
              bookingBuffer: "0",
            },
          },
        ],
      },
      translations: {
        en: { values: { "booking-1/bookingServices[0].name": "Haircut" } },
      },
    },
  ],
});

// Monday 5 October 2026, 10:00 in Paris.
const NOW = Date.parse("2026-10-05T08:00:00Z");

const request = (extra: Record<string, unknown> = {}) => ({
  page: "/rendez-vous/",
  sectionId: "booking-1",
  service: 0,
  date: "2026-10-06",
  time: "09:00",
  values: { name: "Léa Martin", email: "lea@exemple.fr", phone: "06 00 00 00 00" },
  website: "",
  elapsed: 8000,
  ...extra,
});

function deps(db = memoryDb()) {
  const mailed: Array<BookingDoc & { id: string }> = [];
  return {
    db,
    mailed,
    deps: {
      db: db as unknown as Firestore,
      liveSnapshot: async () => snapshot,
      notify: async (booking: BookingDoc & { id: string }) => {
        mailed.push(booking);
        return true;
      },
      salt: "test",
      now: () => NOW,
    },
  };
}

describe("booking", () => {
  it("finds the published section, with its services in the page's language", () => {
    expect(findBooking(snapshot, "/rendez-vous", "booking-1")?.rules.services[0]).toMatchObject({
      name: "Coupe",
      minutes: 60,
    });
    const english = findBooking(snapshot, "/en/rendez-vous/", "booking-1");
    expect(english?.lang).toBe("en");
    expect(english?.rules.services[0]?.name).toBe("Haircut");
    expect(findBooking(snapshot, "/rendez-vous/", "other")).toBeUndefined();
  });

  it("books a free time once, then refuses it to the next visitor", async () => {
    const { db, deps: d, mailed } = deps();
    const first = await handleBooking(request(), "1.1.1.1", d);
    expect(first).toMatchObject({
      status: 200,
      body: {
        ok: true,
        booking: { start: "2026-10-06T07:00:00.000Z", end: "2026-10-06T08:00:00.000Z" },
      },
    });
    const saved = [...db.store.entries()].find(([path]) => path.startsWith("cms_bookings/"));
    expect(saved?.[1]).toMatchObject({
      service: "Coupe",
      duration: 60,
      price: "35 €",
      date: "2026-10-06",
      time: "09:00",
      timeZone: "Europe/Paris",
      name: "Léa Martin",
      status: "confirmed",
    });
    const expiresAt = saved?.[1]?.expiresAt as Date | undefined;
    expect(expiresAt?.toISOString()).toBe("2027-10-06T08:00:00.000Z");
    expect(mailed).toHaveLength(1);
    // The same time, or one overlapping it, is taken.
    const again = await handleBooking(request({ time: "09:30" }), "2.2.2.2", d);
    expect(again).toMatchObject({ status: 409, body: { taken: true } });
    // The busy times are public, without names.
    const busy = await handleBusy({ from: "2026-10-05", days: "7" }, d);
    expect(busy.body.busy).toEqual([
      { start: "2026-10-06T07:00:00.000Z", end: "2026-10-06T08:00:00.000Z" },
    ]);
  });

  it("refuses times outside the rules, and checks the visitor's details", async () => {
    const { deps: d } = deps();
    // Monday: closed.
    expect((await handleBooking(request({ date: "2026-10-05" }), "3.3.3.3", d)).status).toBe(409);
    // Not a start time of the section (every 30 minutes from 09:00).
    expect((await handleBooking(request({ time: "09:10" }), "3.3.3.3", d)).status).toBe(409);
    const invalid = await handleBooking(
      request({ values: { name: "", email: "lea" } }),
      "3.3.3.3",
      d,
    );
    expect(invalid).toMatchObject({ status: 400, body: { errors: { name: expect.any(String) } } });
    expect((await handleBooking(request({ service: 3 }), "3.3.3.3", d)).status).toBe(400);
  });

  it("drops bots silently, and refuses a doubtful reCAPTCHA score", async () => {
    const { db, deps: d } = deps();
    expect(await handleBooking(request({ website: "spam" }), "4.4.4.4", d)).toMatchObject({
      status: 200,
      body: { ok: true },
    });
    expect([...db.store.keys()].some((path) => path.startsWith("cms_bookings/"))).toBe(false);
    const withKey = {
      ...snapshot,
      integrations: { recaptchaSiteKey: "6Lc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    };
    const refused = await handleBooking(request({ token: "t" }), "5.5.5.5", {
      ...d,
      liveSnapshot: async () => withKey,
      recaptchaScore: async () => 0.1,
    });
    expect(refused.status).toBe(403);
  });

  it("writes the owner's e-mail", () => {
    const email = bookingEmail(
      {
        id: "b1",
        page: "/rendez-vous/",
        sectionId: "booking-1",
        service: "Coupe",
        duration: 60,
        start: "2026-10-06T07:00:00.000Z",
        end: "2026-10-06T08:00:00.000Z",
        date: "2026-10-06",
        time: "09:00",
        timeZone: "Europe/Paris",
        name: "Léa <b>",
        email: "lea@exemple.fr",
        status: "confirmed",
        createdAt: "2026-10-05T08:00:00.000Z",
        expiresAt: new Date(),
      },
      "https://site.fr/admin/",
    );
    expect(email.subject).toBe("Nouveau rendez-vous : Coupe, mardi 6 octobre à 09:00");
    expect(email.html).toContain("Léa &lt;b&gt;");
    expect(email.text).toContain("https://site.fr/admin/?view=bookings");
  });
});
