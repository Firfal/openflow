import { formatDate } from "./fields.js";

/**
 * The business behind the site (« Fiche établissement », « Établissement »): one source for
 * what Google, AI assistants and visitors ask first — where, when, how to reach it. It feeds the
 * structured data of the home page (`LocalBusiness`), `llms.txt`, the AI tools, and the site's
 * layout (`site.business`, e.g. the footer).
 */

export const WEEKDAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A time range of a day, `"09:00"` to `"12:30"`. */
export interface TimeRange {
  opens: string;
  closes: string;
}

/** An exceptional closure (holidays, works…), from `from` to `to` included (`YYYY-MM-DD`). */
export interface Closure {
  from: string;
  to?: string;
  /** Shown to visitors and AI assistants: « Congés d'été ». */
  label?: string;
}

export interface BusinessInfo {
  /** schema.org type (`Bakery`, `Restaurant`…); `LocalBusiness` by default. */
  type?: string;
  /** Name of the business when it differs from the site's. */
  name?: string;
  phone?: string;
  email?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  /** ISO 3166 country code (`FR` by default). */
  country?: string;
  /** Regular opening hours by day; a day without ranges is closed. Absent: not given. */
  hours?: Partial<Record<Weekday, TimeRange[]>>;
  /** A word on the hours: « Sur rendez-vous le lundi ». */
  hoursNote?: string;
  closures?: Closure[];
  /** `€` to `€€€€`. */
  priceRange?: "€" | "€€" | "€€€" | "€€€€";
  /** Area served, for businesses that travel: « Lyon et 30 km alentour ». */
  areaServed?: string;
  /** The business elsewhere: Google Business Profile, social networks (schema.org `sameAs`). */
  links?: string[];
}

/** Activities offered to the owner (schema.org types), with their French names. */
export const BUSINESS_TYPES: Array<{ value: string; label: string }> = [
  { value: "LocalBusiness", label: "Commerce ou entreprise locale" },
  { value: "Bakery", label: "Boulangerie, pâtisserie" },
  { value: "Restaurant", label: "Restaurant" },
  { value: "CafeOrCoffeeShop", label: "Café, salon de thé" },
  { value: "BarOrPub", label: "Bar" },
  { value: "Store", label: "Boutique, magasin" },
  { value: "HairSalon", label: "Coiffure" },
  { value: "BeautySalon", label: "Institut de beauté" },
  { value: "MedicalBusiness", label: "Santé (cabinet, praticien)" },
  { value: "HomeAndConstructionBusiness", label: "Artisan du bâtiment" },
  { value: "AutomotiveBusiness", label: "Automobile (garage…)" },
  { value: "LodgingBusiness", label: "Hébergement (hôtel, gîte)" },
  { value: "SportsActivityLocation", label: "Sport, loisirs" },
  { value: "EducationalOrganization", label: "Formation, école" },
  { value: "LegalService", label: "Juridique (avocat, notaire)" },
  { value: "RealEstateAgent", label: "Immobilier" },
  { value: "ProfessionalService", label: "Services aux entreprises (conseil, agence…)" },
  { value: "Organization", label: "Entreprise sans lieu d'accueil du public" },
];

const DAY_NAMES: Record<Weekday, string> = {
  mo: "lundi",
  tu: "mardi",
  we: "mercredi",
  th: "jeudi",
  fr: "vendredi",
  sa: "samedi",
  su: "dimanche",
};
const SCHEMA_DAYS: Record<Weekday, string> = {
  mo: "Monday",
  tu: "Tuesday",
  we: "Wednesday",
  th: "Thursday",
  fr: "Friday",
  sa: "Saturday",
  su: "Sunday",
};

/** No line break inside « 12 h 30 » or before « : » (French typography). */
const NBSP = "\u00a0";

/**
 * `"09:00"` → « 9 h », `"12:30"` → « 12 h 30 » in French (with non-breaking spaces); in another
 * language, the local way (« 9:00 AM », « 09:00 »).
 */
export function formatTime(time: string, lang = "fr"): string {
  const [h, m] = time.split(":");
  if (lang.startsWith("fr")) return `${Number(h)}${NBSP}h${m && m !== "00" ? `${NBSP}${m}` : ""}`;
  try {
    return new Intl.DateTimeFormat(lang, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2024, 0, 1, Number(h), Number(m ?? 0))));
  } catch {
    return time;
  }
}

/** Words of the hours and closures in the site's other languages (French is the default). */
const HOURS_WORDS: Record<
  string,
  {
    range: (a: string, b: string) => string;
    and: string;
    closed: string;
    closedRange: (a: string, b: string) => string;
    closedDay: (a: string) => string;
  }
> = {
  en: {
    range: (a, b) => `${a} to ${b}`,
    and: "and",
    closed: "closed",
    closedRange: (a, b) => `Closed from ${a} to ${b}`,
    closedDay: (a) => `Closed on ${a}`,
  },
  es: {
    range: (a, b) => `De ${a} a ${b}`,
    and: "y",
    closed: "cerrado",
    closedRange: (a, b) => `Cerrado del ${a} al ${b}`,
    closedDay: (a) => `Cerrado el ${a}`,
  },
  de: {
    range: (a, b) => `${a} bis ${b}`,
    and: "und",
    closed: "geschlossen",
    closedRange: (a, b) => `Geschlossen vom ${a} bis ${b}`,
    closedDay: (a) => `Geschlossen am ${a}`,
  },
  it: {
    range: (a, b) => `Da ${a} a ${b}`,
    and: "e",
    closed: "chiuso",
    closedRange: (a, b) => `Chiuso dal ${a} al ${b}`,
    closedDay: (a) => `Chiuso il ${a}`,
  },
  pt: {
    range: (a, b) => `De ${a} a ${b}`,
    and: "e",
    closed: "fechado",
    closedRange: (a, b) => `Fechado de ${a} a ${b}`,
    closedDay: (a) => `Fechado a ${a}`,
  },
  nl: {
    range: (a, b) => `${a} t/m ${b}`,
    and: "en",
    closed: "gesloten",
    closedRange: (a, b) => `Gesloten van ${a} tot ${b}`,
    closedDay: (a) => `Gesloten op ${a}`,
  },
};

const wordsOf = (lang: string) => HOURS_WORDS[lang.slice(0, 2)] ?? HOURS_WORDS.en!;

/** A weekday's name in a language (2024-01-01 was a Monday). */
function dayName(day: Weekday, lang: string): string {
  if (lang.startsWith("fr")) return DAY_NAMES[day];
  try {
    return new Intl.DateTimeFormat(lang, { weekday: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 1 + WEEKDAYS.indexOf(day))),
    );
  } catch {
    return SCHEMA_DAYS[day];
  }
}

const rangesText = (ranges: TimeRange[], lang: string) =>
  ranges.map((r) => `${formatTime(r.opens, lang)} – ${formatTime(r.closes, lang)}`).join(", ");

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The weekly hours, consecutive days with the same hours grouped: « Du mardi au samedi :
 * 9 h – 12 h 30, 14 h – 19 h », « Dimanche et lundi : fermé » (in French by default, or in the
 * page's language: « Tuesday to Saturday: … »). Empty when no hours are given.
 */
export function formatOpeningHours(hours: BusinessInfo["hours"], lang = "fr"): string[] {
  if (!hours || Object.keys(hours).length === 0) return [];
  if (!lang.startsWith("fr")) return otherHours(hours, lang);
  const key = (day: Weekday) => rangesText(hours[day] ?? [], lang) || "fermé";
  const groups: Array<{ days: Weekday[]; text: string }> = [];
  for (const day of WEEKDAYS) {
    const text = key(day);
    const last = groups.at(-1);
    if (last && last.text === text) last.days.push(day);
    else groups.push({ days: [day], text });
  }
  return groups.map(({ days, text }) => {
    const first = DAY_NAMES[days[0] as Weekday];
    const label =
      days.length === 1
        ? capitalize(first)
        : days.length === 2
          ? `${capitalize(first)} et ${DAY_NAMES[days[1] as Weekday]}`
          : `Du ${first} au ${DAY_NAMES[days.at(-1) as Weekday]}`;
    return `${label}${NBSP}: ${text}`;
  });
}

function otherHours(hours: NonNullable<BusinessInfo["hours"]>, lang: string): string[] {
  const words = wordsOf(lang);
  const groups: Array<{ days: Weekday[]; text: string }> = [];
  for (const day of WEEKDAYS) {
    const text = rangesText(hours[day] ?? [], lang) || words.closed;
    const last = groups.at(-1);
    if (last && last.text === text) last.days.push(day);
    else groups.push({ days: [day], text });
  }
  return groups.map(({ days, text }) => {
    const first = dayName(days[0] as Weekday, lang);
    const lastDay = dayName(days.at(-1) as Weekday, lang);
    const label =
      days.length === 1
        ? capitalize(first)
        : days.length === 2
          ? `${capitalize(first)} ${words.and} ${lastDay}`
          : capitalize(words.range(first, lastDay));
    return `${label}: ${text}`;
  });
}

/** Closures not over yet, in date order. */
export function upcomingClosures(business: BusinessInfo | undefined, today: string): Closure[] {
  return (business?.closures ?? [])
    .filter((closure) => (closure.to ?? closure.from) >= today)
    .sort((a, b) => a.from.localeCompare(b.from));
}

const DATE_FORMAT = new Intl.DateTimeFormat("fr", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const frDate = (value: string) => {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return DATE_FORMAT.format(new Date(Date.UTC(y, m - 1, d)));
};

/** « Fermé du 10 août 2026 au 20 août 2026 (congés d'été) », or in the page's language. */
export function formatClosure(closure: Closure, lang = "fr"): string {
  if (!lang.startsWith("fr")) {
    const words = wordsOf(lang);
    const date = (value: string) => formatDate(value, lang);
    const when =
      closure.to && closure.to !== closure.from
        ? words.closedRange(date(closure.from), date(closure.to))
        : words.closedDay(date(closure.from));
    return `${when}${closure.label ? ` (${closure.label})` : ""}`;
  }
  const when =
    closure.to && closure.to !== closure.from
      ? `du ${frDate(closure.from)} au ${frDate(closure.to)}`
      : `le ${frDate(closure.from)}`;
  return `Fermé ${when}${closure.label ? ` (${closure.label})` : ""}`;
}

/** The postal address on one line. */
export function formatAddress(business: BusinessInfo | undefined): string {
  if (!business) return "";
  const city = [business.postalCode, business.city].filter(Boolean).join(" ");
  return [business.street, city].filter(Boolean).join(", ");
}

/** A Google Maps link to the address (none without a street or a city). */
export function mapUrl(business: BusinessInfo | undefined): string | undefined {
  const address = formatAddress(business);
  if (!address) return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** The business's address as a schema.org `PostalAddress`, when it has one. */
export function postalAddress(b: BusinessInfo | undefined): Record<string, unknown> | undefined {
  if (!b || !formatAddress(b)) return undefined;
  return {
    "@type": "PostalAddress",
    ...(b.street ? { streetAddress: b.street } : {}),
    ...(b.postalCode ? { postalCode: b.postalCode } : {}),
    ...(b.city ? { addressLocality: b.city } : {}),
    addressCountry: b.country ?? "FR",
  };
}

/**
 * The business as schema.org JSON-LD (`LocalBusiness` or one of its types): name, contact, address,
 * weekly hours, upcoming closures (`specialOpeningHoursSpecification`), price range, links.
 */
export function businessJsonLd(
  site: { name: string; url?: string; description?: string; business?: BusinessInfo },
  options: { today: string; url?: string; image?: string; bookingUrl?: string },
): Record<string, unknown> | undefined {
  const b = site.business;
  if (!b) return undefined;
  const type = b.type ?? "LocalBusiness";
  const address = postalAddress(b);
  const hours = b.hours
    ? WEEKDAYS.flatMap((day) => (b.hours?.[day] ?? []).map((range) => ({ day, ...range }))).reduce<
        Array<{ days: string[]; opens: string; closes: string }>
      >((groups, entry) => {
        const same = groups.find((g) => g.opens === entry.opens && g.closes === entry.closes);
        if (same) same.days.push(SCHEMA_DAYS[entry.day]);
        else
          groups.push({ days: [SCHEMA_DAYS[entry.day]], opens: entry.opens, closes: entry.closes });
        return groups;
      }, [])
    : [];
  const closures = upcomingClosures(b, options.today);
  return {
    "@context": "https://schema.org",
    "@type": type,
    ...(options.url ? { "@id": `${options.url}#business` } : {}),
    name: b.name || site.name,
    ...(options.url ? { url: options.url } : {}),
    ...(site.description ? { description: site.description } : {}),
    ...(options.image ? { image: options.image } : {}),
    ...(b.phone ? { telephone: b.phone } : {}),
    ...(b.email ? { email: b.email } : {}),
    ...(address && type !== "Organization" ? { address } : {}),
    ...(hours.length > 0 && type !== "Organization"
      ? {
          openingHoursSpecification: hours.map((h) => ({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: h.days,
            opens: h.opens,
            closes: h.closes,
          })),
        }
      : {}),
    ...(closures.length > 0 && type !== "Organization"
      ? {
          // schema.org: opens = closes = 00:00 means closed on those days.
          specialOpeningHoursSpecification: closures.map((c) => ({
            "@type": "OpeningHoursSpecification",
            validFrom: c.from,
            validThrough: c.to ?? c.from,
            opens: "00:00",
            closes: "00:00",
          })),
        }
      : {}),
    ...(b.priceRange ? { priceRange: b.priceRange } : {}),
    ...(b.areaServed ? { areaServed: b.areaServed } : {}),
    ...(b.links?.length ? { sameAs: b.links } : {}),
    // Appointments taken on the site: Google and AI assistants can offer to book.
    ...(options.bookingUrl
      ? {
          potentialAction: {
            "@type": "ReserveAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: options.bookingUrl,
              actionPlatform: [
                "http://schema.org/DesktopWebPlatform",
                "http://schema.org/MobileWebPlatform",
              ],
            },
            result: { "@type": "Reservation", name: "Rendez-vous" },
          },
        }
      : {}),
  };
}

/** The practical information as Markdown lines (`llms.txt`, AI tools). */
export function businessLines(
  site: { name: string; business?: BusinessInfo },
  today: string,
): string[] {
  const b = site.business;
  if (!b) return [];
  const lines: string[] = [];
  const type = BUSINESS_TYPES.find((t) => t.value === b.type)?.label;
  if (type && b.type !== "LocalBusiness") lines.push(`- Activité : ${type}`);
  const address = formatAddress(b);
  if (address) lines.push(`- Adresse : ${address}`);
  if (b.areaServed) lines.push(`- Zone desservie : ${b.areaServed}`);
  if (b.phone) lines.push(`- Téléphone : ${b.phone}`);
  if (b.email) lines.push(`- E-mail : ${b.email}`);
  const hours = formatOpeningHours(b.hours);
  if (hours.length > 0) {
    lines.push("- Horaires :");
    for (const line of hours) lines.push(`  - ${line}`);
  }
  if (b.hoursNote) lines.push(`- ${b.hoursNote}`);
  for (const closure of upcomingClosures(b, today)) lines.push(`- ${formatClosure(closure)}`);
  if (b.priceRange) lines.push(`- Gamme de prix : ${b.priceRange}`);
  for (const link of b.links ?? []) lines.push(`- Aussi sur : ${link}`);
  return lines;
}
