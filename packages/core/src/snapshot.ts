import type { Data } from "@puckeditor/core";
import { z } from "zod";
import type { PageDoc, SettingsDoc, SiteSettings } from "./model.js";
import { isValidSlug, slugToPath } from "./slug.js";
import { ensureIds, resolvePageLinks } from "./walk.js";

export const SNAPSHOT_VERSION = 1;

const componentSchema = z.looseObject({
  type: z.string().min(1),
  props: z.record(z.string(), z.unknown()),
});

/** Structural schema of Puck page data (props are validated against the config separately). */
export const pageDataSchema = z.looseObject({
  root: z
    .looseObject({ props: z.record(z.string(), z.unknown()).optional() })
    .default({ props: {} }),
  content: z.array(componentSchema).default([]),
  zones: z.record(z.string(), z.array(componentSchema)).optional(),
});

export const seoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  ogImage: z.string().optional(),
  noindex: z.boolean().optional(),
});

export const slugSchema = z
  .string()
  .refine(isValidSlug, "Slug invalide : minuscules, chiffres et tirets, séparés par « / »");

export const siteSettingsSchema = z.object({
  name: z.string().min(1),
  lang: z.string().min(2).default("fr"),
  url: z.string().url().optional(),
  description: z.string().optional(),
  ogImage: z.string().optional(),
});

export const snapshotPageSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  title: z.string().min(1),
  seo: seoSchema.default({}),
  data: pageDataSchema,
});

export const snapshotSchema = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  releaseId: z.string().min(1),
  createdAt: z.string(),
  site: siteSettingsSchema,
  settings: z.record(z.string(), z.unknown()).default({}),
  pages: z.array(snapshotPageSchema),
});

export type SnapshotPage = z.infer<typeof snapshotPageSchema> & { data: Data };
export type Snapshot = Omit<z.infer<typeof snapshotSchema>, "pages"> & { pages: SnapshotPage[] };

export interface SnapshotInput {
  releaseId: string;
  createdAt?: string;
  settings: Pick<SettingsDoc, "site" | "values">;
  pages: Array<Pick<PageDoc, "slug" | "title" | "status" | "seo" | "data"> & { id: string }>;
}

export class SnapshotError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "SnapshotError";
  }
}

/**
 * Freezes the published state of the site: keeps published pages only, assigns missing
 * component ids, re-resolves internal links from current slugs and checks slug uniqueness.
 */
export function createSnapshot(input: SnapshotInput): Snapshot {
  const published = input.pages.filter((page) => page.status === "published");
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const page of published) {
    if (!isValidSlug(page.slug))
      problems.push(`Page « ${page.title} » : slug invalide « ${page.slug} »`);
    const other = seen.get(page.slug);
    if (other !== undefined) {
      problems.push(
        `Pages « ${other} » et « ${page.title} » : même adresse ${slugToPath(page.slug)}`,
      );
    }
    seen.set(page.slug, page.title);
  }
  if (problems.length > 0) throw new SnapshotError("Publication impossible", problems);

  const hrefByPageId = new Map(input.pages.map((page) => [page.id, slugToPath(page.slug)]));
  const pages = published
    .map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      seo: page.seo ?? {},
      data: resolvePageLinks(ensureIds(page.data), hrefByPageId),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const site: SiteSettings = { ...input.settings.site, lang: input.settings.site.lang || "fr" };
  return {
    version: SNAPSHOT_VERSION,
    releaseId: input.releaseId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    site,
    settings: resolvePageLinks(input.settings.values ?? {}, hrefByPageId),
    pages,
  };
}

/** Parses and validates an unknown value (e.g. a JSON file) as a snapshot. */
export function parseSnapshot(value: unknown): Snapshot {
  const result = snapshotSchema.safeParse(value);
  if (!result.success) {
    throw new SnapshotError(
      "Snapshot invalide",
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  return result.data as Snapshot;
}

export function findPage(snapshot: Snapshot, slug: string): SnapshotPage | undefined {
  return snapshot.pages.find((page) => page.slug === slug);
}
