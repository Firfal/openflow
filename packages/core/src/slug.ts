/**
 * Slugs are URL paths without leading/trailing slashes. The home page has the empty slug `""`.
 * Each segment only contains lowercase letters, digits and dashes.
 */
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  if (slug === "") return true;
  return slug.split("/").every((segment) => SEGMENT.test(segment));
}

/** Turns a free-form title into a slug segment: "Nos Crêpes !" → "nos-crepes". */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalizes user input ("/A propos/", "a propos") into a valid slug ("a-propos"). */
export function normalizeSlug(input: string): string {
  return input
    .split("/")
    .map((segment) => slugify(segment))
    .filter(Boolean)
    .join("/");
}

/** `""` → `"/"`, `"a-propos"` → `"/a-propos/"` (static export uses trailing slashes). */
export function slugToPath(slug: string): string {
  return slug === "" ? "/" : `/${slug}/`;
}

/** Next.js optional catch-all params for a slug: `""` → `[]`, `"a/b"` → `["a", "b"]`. */
export function slugToParams(slug: string): string[] {
  return slug === "" ? [] : slug.split("/");
}

export function paramsToSlug(params: string[] | undefined): string {
  return (params ?? []).map((part) => decodeURIComponent(part)).join("/");
}
