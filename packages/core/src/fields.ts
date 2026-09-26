import type { CustomField, Field } from "@puckeditor/core";
import { createElement } from "react";

/** Key stored in `field.metadata` to mark OpenFlow-specific field kinds. */
export const OPENFLOW_FIELD_KEY = "openflow";

export type OpenFlowFieldKind = "image" | "link" | "video";

/** Value stored by an {@link imageField}. `src` is a public URL (Cloud Storage or absolute). */
export interface ImageValue {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

/** Value stored by a {@link videoField}: a muted, looping video (MP4 or WebM, 15 MB max). */
export interface VideoValue {
  src: string;
  /** Image shown before the video plays (and instead of it for reduced motion). */
  poster?: string;
  /** Short description for assistive technologies. */
  description?: string;
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

/** Props to spread on an `<a>` element for a {@link LinkValue}. */
export function linkProps(link: LinkValue | null | undefined): {
  href: string;
  target?: string;
  rel?: string;
} {
  if (!link?.href) return { href: "#" };
  return link.newTab
    ? { href: link.href, target: "_blank", rel: "noopener noreferrer" }
    : {
        href: link.href,
      };
}

/**
 * Props to spread on an `<img>` element for an {@link ImageValue}. Returns `null` when empty.
 * Also carries the element marker (`data-of`) that lets the owner click the image in the editor.
 */
export function imageProps(image: ImageValue | null | undefined): {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  "data-of"?: string;
  "data-of-i"?: string;
} | null {
  if (!image?.src) return null;
  const mark = (image as { __of?: { p: string; i?: string } }).__of;
  return {
    src: image.src,
    alt: image.alt ?? "",
    width: image.width,
    height: image.height,
    ...(mark ? { "data-of": mark.p, "data-of-i": mark.i } : {}),
  };
}

/**
 * Props to spread on a `<video>` element for a {@link VideoValue}. Returns `null` when empty.
 * Also carries the element marker (`data-of`) used by the editor.
 */
export function videoProps(video: VideoValue | null | undefined): {
  src?: string;
  poster?: string;
  "aria-label"?: string;
  "data-of"?: string;
  "data-of-i"?: string;
} | null {
  const mark = (video as { __of?: { p: string; i?: string; e?: 1 } } | null | undefined)?.__of;
  // An empty video is only rendered in the editor, as a clickable placeholder (its poster).
  if (!video?.src && !mark?.e) return null;
  return {
    src: video?.src || undefined,
    poster: video?.poster || undefined,
    "aria-label": video?.description || undefined,
    ...(mark ? { "data-of": mark.p, "data-of-i": mark.i } : {}),
  };
}
