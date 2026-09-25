import type { Data } from "@puckeditor/core";
import { z } from "zod";
import type { OpenFlowConfig } from "./config.js";
import type { PageDoc, SettingsDoc } from "./model.js";
import { pageDataSchema, seoSchema, siteSettingsSchema, slugSchema } from "./snapshot.js";

/** `openflow/seed/pages/<id>.json` — initial content of a page, written by the site author. */
export const seedPageSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1),
  status: z.enum(["draft", "published"]).default("published"),
  seo: seoSchema.default({}),
  data: pageDataSchema,
});

/** `openflow/seed/settings.json` — initial global settings. */
export const seedSettingsSchema = z.object({
  site: siteSettingsSchema.partial().default({}),
  values: z.record(z.string(), z.unknown()).default({}),
});

export const PAGE_ID = /^[a-z0-9][a-z0-9-]*$/;

export type SeedPage = z.infer<typeof seedPageSchema> & { id: string; data: Data };
export type SeedSettings = z.infer<typeof seedSettingsSchema>;

export interface Seed {
  settings: Pick<SettingsDoc, "site" | "values">;
  pages: Array<Pick<PageDoc, "slug" | "title" | "status" | "seo" | "data"> & { id: string }>;
}

/** Completes seed settings with the config defaults (`site`, `settings.defaultProps`). */
export function resolveSeedSettings(
  seed: SeedSettings | undefined,
  config: OpenFlowConfig,
): Seed["settings"] {
  return {
    site: {
      name: config.site.name,
      lang: config.site.lang ?? "fr",
      url: config.site.url,
      description: config.site.description,
      ...stripUndefined(seed?.site ?? {}),
    },
    values: { ...(config.settings?.defaultProps ?? {}), ...(seed?.values ?? {}) },
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
