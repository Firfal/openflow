import type { CustomField, Field } from "@puckeditor/core";
import { createElement } from "react";

/** Key stored in `field.metadata` to mark OpenFlow-specific field kinds. */
export const OPENFLOW_FIELD_KEY = "openflow";

export type OpenFlowFieldKind = "image" | "link" | "video";

/** An optimized copy of an image (WebP), made when it is added to the media library. */
export interface ImageVariant {
  url: string;
  width: number;
  height: number;
  size?: number;
}

/** An optimized copy of a video (H.264 MP4, 1080p or 720p). */
export interface VideoVariant {
  url: string;
  width: number;
  height: number;
  size?: number;
}

/** Value stored by an {@link imageField}. `src` is a public URL (Cloud Storage or absolute). */
export interface ImageValue {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /** Optimized copies, added at publication (never edited by hand). */
  variants?: ImageVariant[];
}

/** Value stored by a {@link videoField}: a muted, looping video (MP4, WebM or MOV). */
export interface VideoValue {
  src: string;
  /** Image shown before the video plays (and instead of it for reduced motion). */
  poster?: string;
  /** Short description for assistive technologies. */
  description?: string;
  /** Optimized copies (1080p, 720p), added at publication. */
  variants?: VideoVariant[];
}

/** Value stored by a {@link linkField}. Page links are re-resolved at publish time. */
export type LinkValue =
  | { kind: "page"; pageId: string; href: string; newTab?: boolean }
  | { kind: "url"; href: string; newTab?: boolean };

const placeholder =
  (kind: OpenFlowFieldKind): CustomField<unknown>["render"] =>
  () =>
    createElement(
      "span",
      { "data-openflow-field": kind },
      "Ce champ s'édite dans l'admin OpenFlow.",
    );

/**
 * An image picked from the OpenFlow media library (Cloud Storage).
 * Render it with `<img src={image?.src} alt={image?.alt ?? ""} />` — never hard-code `src`.
 */
export function imageField(
  options: {
    label?: string;
    /**
     * In the editor, an empty image shows a clickable « Ajouter une image » placeholder (default).
     * Disable it when the absence of the image changes the layout (e.g. a centred hero).
     */
    placeholder?: boolean;
  } = {},
): CustomField<ImageValue | null> {
  return {
    type: "custom",
    label: options.label,
    metadata: {
      [OPENFLOW_FIELD_KEY]: "image",
      ...(options.placeholder === false ? { openflowPlaceholder: false } : {}),
    },
    render: placeholder("image") as CustomField<ImageValue | null>["render"],
  };
}

/**
 * A short video (MP4 or WebM) from the media library, for backgrounds and visuals.
 * Render it with `const v = videoProps(video); v && <video {...v} muted loop playsInline />`.
 */
export function videoField(
  options: {
    label?: string;
    /** In the editor, an empty video shows a clickable « Ajouter une vidéo » placeholder (default). */
    placeholder?: boolean;
  } = {},
): CustomField<VideoValue | null> {
  return {
    type: "custom",
    label: options.label,
    metadata: {
      [OPENFLOW_FIELD_KEY]: "video",
      ...(options.placeholder === false ? { openflowPlaceholder: false } : {}),
    },
    render: placeholder("video") as CustomField<VideoValue | null>["render"],
  };
}

/**
 * A link to an internal page (kept in sync when the page slug changes) or to an external URL.
 * Render it with `<a {...linkProps(link)}>` — never hard-code `href`.
 */
export function linkField(options: { label?: string } = {}): CustomField<LinkValue | null> {
  return {
    type: "custom",
    label: options.label,
    metadata: { [OPENFLOW_FIELD_KEY]: "link" },
    render: placeholder("link") as CustomField<LinkValue | null>["render"],
  };
}

/** Returns the OpenFlow kind of a field (`image`, `link`) or `undefined` for plain Puck fields. */
export function getOpenFlowFieldKind(field: Field | undefined): OpenFlowFieldKind | undefined {
  const kind = field?.metadata?.[OPENFLOW_FIELD_KEY];
  return kind === "image" || kind === "link" || kind === "video" ? kind : undefined;
}

/** Link targets allowed on the site: web pages, e-mail, phone, and paths of the site. */
const SAFE_HREF = /^(?:https?:|mailto:|tel:|[/#?])/i;

/** True for an `href` OpenFlow renders (never `javascript:`, `data:`…). */
export function isSafeHref(href: string): boolean {
  return SAFE_HREF.test(href.trim());
}

/** Props to spread on an `<a>` element for a {@link LinkValue}. Unsafe targets become `#`. */
export function linkProps(link: LinkValue | null | undefined): {
  href: string;
  target?: string;
  rel?: string;
  "data-of-l"?: string;
  "data-of-i"?: string;
} {
  // Editor marker (see `markProps`): lets the owner's click on a button reach its link field.
  const mark = (link as { __of?: { p: string; i?: string } } | null | undefined)?.__of;
  const marker = mark ? { "data-of-l": mark.p, "data-of-i": mark.i } : {};
  if (!link?.href || !isSafeHref(link.href)) return { href: "#", ...marker };
  return link.newTab
    ? { href: link.href, target: "_blank", rel: "noopener noreferrer", ...marker }
    : { href: link.href, ...marker };
}

/**
 * Props to spread on an `<img>` element for an {@link ImageValue}. Returns `null` when empty.
 * Also carries the element marker (`data-of`) that lets the owner click the image in the editor.
 * Once published, an image of the media library has optimized copies: `srcSet` lets the browser
 * download the right width, and `sizes` (the displayed width, `100vw` by default) guides it.
 */
export function imageProps(
  image: ImageValue | null | undefined,
  options: { sizes?: string } = {},
): {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  srcSet?: string;
  sizes?: string;
  "data-of"?: string;
  "data-of-i"?: string;
} | null {
  if (!image?.src) return null;
  const mark = (image as { __of?: { p: string; i?: string } }).__of;
  const variants = [...(image.variants ?? [])].sort((a, b) => a.width - b.width);
  // Fallback `src`: the copy closest to 1440 px, never the (possibly huge) original.
  const fallback = variants.find((v) => v.width >= 1440) ?? variants.at(-1);
  return {
    src: fallback?.url ?? image.src,
    alt: image.alt ?? "",
    width: image.width,
    height: image.height,
    ...(variants.length > 1
      ? {
          srcSet: variants.map((v) => `${v.url} ${v.width}w`).join(", "),
          sizes: options.sizes ?? "100vw",
        }
      : {}),
    ...(mark ? { "data-of": mark.p, "data-of-i": mark.i } : {}),
  };
}

/**
 * Props to spread on a `<video>` element for a {@link VideoValue}. Returns `null` when empty.
 * Also carries the element marker (`data-of`) used by the editor. Once published, a video of the
 * media library is played from its optimized copies: 720p on phones, 1080p elsewhere
 * (`<source media>`), with the poster extracted from the video when none was chosen.
 */
export function videoProps(video: VideoValue | null | undefined): {
  src?: string;
  poster?: string;
  "aria-label"?: string;
  children?: ReturnType<typeof createElement>[];
  "data-of"?: string;
  "data-of-i"?: string;
} | null {
  const mark = (video as { __of?: { p: string; i?: string; e?: 1 } } | null | undefined)?.__of;
  // An empty video is only rendered in the editor, as a clickable placeholder (its poster).
  if (!video?.src && !mark?.e) return null;
  // Largest first: the default source; the smallest serves phones (first matching source wins).
  const variants = [...(video?.variants ?? [])].sort(
    (a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height),
  );
  const large = variants[0];
  const small = variants.length > 1 ? variants.at(-1) : undefined;
  const sources = large
    ? [
        ...(small
          ? [
              createElement("source", {
                key: small.url,
                src: small.url,
                type: "video/mp4",
                media: "(max-width: 767px)",
              }),
            ]
          : []),
        createElement("source", { key: large.url, src: large.url, type: "video/mp4" }),
      ]
    : undefined;
  return {
    ...(sources ? {} : { src: video?.src || undefined }),
    poster: video?.poster || undefined,
    "aria-label": video?.description || undefined,
    ...(sources ? { children: sources } : {}),
    ...(mark ? { "data-of": mark.p, "data-of-i": mark.i } : {}),
  };
}
