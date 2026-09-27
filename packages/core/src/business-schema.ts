import { z } from "zod";
import { BUSINESS_TYPES, type BusinessInfo, WEEKDAYS } from "./business.js";
import { isValidDate } from "./fields.js";

/**
 * Validation of the business profile (zod), apart from `business.ts` so that the admin's
 * dashboard, which formats hours, does not download the schemas.
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeRange = z
  .object({ opens: z.string().regex(TIME), closes: z.string().regex(TIME) })
  .refine((range) => range.opens < range.closes || range.closes === "00:00", {
    message: "L'heure de fermeture doit suivre l'heure d'ouverture",
  });
const date = z.string().refine(isValidDate, "Date AAAA-MM-JJ attendue");
const text = (max: number) => z.string().trim().max(max).optional();

export const businessSchema = z.object({
  type: z
    .string()
    .refine((value) => BUSINESS_TYPES.some((t) => t.value === value))
    .optional(),
  name: text(120),
  phone: text(40),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  street: text(160),
  postalCode: text(16),
  city: text(80),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  hours: z.partialRecord(z.enum(WEEKDAYS), z.array(timeRange).max(4)).optional(),
  hoursNote: text(160),
  closures: z
    .array(z.object({ from: date, to: date.optional(), label: text(80) }))
    .max(60)
    .optional(),
  priceRange: z.enum(["€", "€€", "€€€", "€€€€"]).optional(),
  areaServed: text(160),
  links: z
    .array(
      z
        .string()
        .url()
        .regex(/^https:\/\//i),
    )
    .max(12)
    .optional(),
});

/** Keeps the valid parts of a business profile (anything else is dropped at publication). */
export function sanitizeBusiness(value: unknown): BusinessInfo | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const field = businessSchema.shape[key as keyof typeof businessSchema.shape];
    if (!field || entry === undefined || entry === null || entry === "") continue;
    const parsed = field.safeParse(entry);
    if (parsed.success && parsed.data !== undefined && parsed.data !== "") out[key] = parsed.data;
  }
  return Object.keys(out).length > 0 ? (out as BusinessInfo) : undefined;
}
