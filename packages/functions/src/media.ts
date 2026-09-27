import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  COLLECTIONS,
  type ImageVariant,
  type MediaDoc,
  publicStorageUrl,
  STORAGE_PATHS,
  type VideoVariant,
} from "@openflow/core";
import type { Firestore } from "firebase-admin/firestore";

/**
 * Media optimization, run by `cmsOptimizeMedia` on every file added to the media library:
 * - images: WebP copies at several widths for `srcset` (quality 82: indistinguishable from the
 *   original on screen, several times lighter), orientation applied, metadata (GPS…) removed;
 * - videos: H.264 MP4 in 1080p and 720p, CRF 22 and 23 (visually transparent), with a
 *   bitrate cap against spikes, at most 30 frames per second, without sound (the videos of a site
 *   play muted in a loop), `faststart` so they start before being fully downloaded; plus a poster.
 * The originals are kept: the owner's file is never altered.
 */

const run = promisify(execFile);

/** Widths of the WebP copies of an image (never wider than the original). */
export const IMAGE_WIDTHS = [480, 960, 1440, 1920, 2560];
export const IMAGE_QUALITY = 82;

export function imageWidths(original: number): number[] {
  const widths = IMAGE_WIDTHS.filter((width) => width < original);
  if (original <= IMAGE_WIDTHS.at(-1)! && !widths.includes(original)) widths.push(original);
  return widths.length > 0 ? widths : [Math.min(original, IMAGE_WIDTHS.at(-1)!)];
}

export interface VideoRendition {
  /** Short side in pixels (1080 for a 1920×1080 or a 1080×1920 video). */
  size: number;
  crf: number;
  maxrate: string;
  bufsize: string;
}

/**
 * Two renditions: 1080p for large screens, 720p for phones (`<source media>`). Measured on a real
 * 10 s 1080p clip (31.5 MB): CRF 22 gives 8 MB at VMAF 93.6, the level where the copy cannot be
 * told apart from the original; CRF 23 saves 15 % more but drops below it. The bitrate cap only
 * matters for very grainy footage (it keeps a 10 s loop around 10 MB).
 */
export const VIDEO_RENDITIONS: VideoRendition[] = [
  { size: 1080, crf: 22, maxrate: "8M", bufsize: "16M" },
  { size: 720, crf: 23, maxrate: "4M", bufsize: "8M" },
];

/** Renditions for a source whose short side is `short` (a small source gets one, at its size). */
export function renditionsFor(short: number): VideoRendition[] {
  const [large, small] = VIDEO_RENDITIONS as [VideoRendition, VideoRendition];
  const even = short - (short % 2);
  if (even <= small.size) return [{ ...small, size: even }];
  return [{ ...large, size: Math.min(large.size, even) }, small];
}

/** ffmpeg arguments of one rendition (pure: tested). */
export function videoArgs(
  input: string,
  output: string,
  rendition: VideoRendition,
  options: { durationSeconds?: number } = {},
): string[] {
  const s = rendition.size;
  // The short side is capped (landscape or portrait), the other follows, even for H.264.
  const scale = `scale='if(gt(iw,ih),-2,trunc(min(${s},iw)/2)*2)':'if(gt(iw,ih),trunc(min(${s},ih)/2)*2,-2)':flags=lanczos`;
  // `slow` gives the best size for the quality; very long videos use `medium` to finish in time.
  const preset = (options.durationSeconds ?? 0) > 90 ? "medium" : "slow";
  return [
    "-hide_banner",
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    "-an",
    "-vf",
    scale,
    "-fpsmax",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    String(rendition.crf),
    "-maxrate",
    rendition.maxrate,
    "-bufsize",
    rendition.bufsize,
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ];
}

/** Duration and size of a video, read from ffmpeg's report (no ffprobe needed). */
export function parseVideoInfo(report: string): {
  durationSeconds?: number;
  width?: number;
  height?: number;
} {
  const duration = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(report);
  const size = /Stream #\d+:\d+[^\n]*Video:[^\n]*?,\s(\d{2,5})x(\d{2,5})[,\s]/.exec(report);
  const rotation = /rotate\s*:\s*-?(90|270)|displaymatrix: rotation of -?(90|270)/.exec(report);
  const width = size ? Number(size[1]) : undefined;
  const height = size ? Number(size[2]) : undefined;
  return {
    durationSeconds: duration
      ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
      : undefined,
    // Phone videos are often stored landscape with a rotation flag.
    ...(rotation ? { width: height, height: width } : { width, height }),
  };
}

let ffmpegPath: string | undefined;
async function ffmpeg(): Promise<string> {
  if (!ffmpegPath) {
    const module = (await import("ffmpeg-static")) as unknown as { default: string | null };
    if (!module.default) throw new Error("ffmpeg indisponible sur cette plateforme");
    ffmpegPath = module.default;
  }
  return ffmpegPath;
}

async function probe(file: string) {
  // `ffmpeg -i` without output exits with an error but prints the stream report on stderr.
  const result = await run(await ffmpeg(), ["-hide_banner", "-i", file], {
    maxBuffer: 4 * 1024 * 1024,
  }).catch((error: { stderr?: string }) => ({ stderr: error.stderr ?? "" }));
  return parseVideoInfo(result.stderr);
}

export interface Storage {
  bucketName: string;
  download(objectPath: string): Promise<Buffer>;
  upload(objectPath: string, data: Buffer, contentType: string): Promise<void>;
  /** Public URL of an object (the emulator's with the local emulators). */
  publicUrl?(objectPath: string): string;
}

const urlOf = (storage: Storage, objectPath: string) =>
  storage.publicUrl?.(objectPath) ?? publicStorageUrl(storage.bucketName, objectPath);

const optimizedPath = (source: string, file: string) =>
  `${STORAGE_PATHS.media}/optimized/${source.slice(STORAGE_PATHS.media.length + 1).replace(/\.[^.]+$/, "")}/${file}`;

/** Is `objectPath` an original of the library (not one of our copies)? */
export function isOriginalMedia(objectPath: string): boolean {
  return (
    objectPath.startsWith(`${STORAGE_PATHS.media}/`) &&
    !objectPath.startsWith(`${STORAGE_PATHS.media}/optimized/`)
  );
}

export async function optimizeImage(
  storage: Storage,
  objectPath: string,
): Promise<Pick<MediaDoc, "variants" | "width" | "height"> | undefined> {
  const { default: sharp } = await import("sharp");
  const input = await storage.download(objectPath);
  const meta = await sharp(input).metadata();
  // Animated GIF or WebP: kept as is (a still copy would lose the animation).
  if ((meta.pages ?? 1) > 1 || !meta.width || !meta.height) return undefined;
  const upright = (meta.orientation ?? 1) >= 5;
  const width = upright ? meta.height : meta.width;
  const height = upright ? meta.width : meta.height;
  const variants: ImageVariant[] = [];
  for (const target of imageWidths(width)) {
    const { data, info } = await sharp(input)
      .rotate()
      .resize({ width: target, withoutEnlargement: true })
      .webp({ quality: IMAGE_QUALITY, effort: 5, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    const file = optimizedPath(objectPath, `${info.width}.webp`);
    await storage.upload(file, data, "image/webp");
    variants.push({
      url: urlOf(storage, file),
      width: info.width,
      height: info.height,
      size: data.length,
    });
  }
  return { variants, width, height };
}

export async function optimizeVideo(
  storage: Storage,
  objectPath: string,
): Promise<Pick<MediaDoc, "variants" | "poster" | "width" | "height"> | undefined> {
  const dir = await mkdtemp(path.join(tmpdir(), "openflow-video-"));
  try {
    const input = path.join(dir, "source");
    await writeFile(input, await storage.download(objectPath));
    const info = await probe(input);
    if (!info.width || !info.height) throw new Error("vidéo illisible");
    const short = Math.min(info.width, info.height);
    const variants: VideoVariant[] = [];
    for (const rendition of renditionsFor(short)) {
      const output = path.join(dir, `${rendition.size}.mp4`);
      await run(
        await ffmpeg(),
        videoArgs(input, output, rendition, { durationSeconds: info.durationSeconds }),
        {
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      const file = optimizedPath(objectPath, `${rendition.size}p.mp4`);
      await storage.upload(file, await readFile(output), "video/mp4");
      const ratio = info.width / info.height;
      variants.push({
        url: urlOf(storage, file),
        width: ratio >= 1 ? Math.round(rendition.size * ratio) : rendition.size,
        height: ratio >= 1 ? rendition.size : Math.round(rendition.size / ratio),
        size: (await stat(output)).size,
      });
    }
    // Poster: a frame at one second (or the first one), 1280 px wide, WebP.
    const frame = path.join(dir, "frame.png");
    const at = (info.durationSeconds ?? 0) > 1.5 ? "1" : "0";
    await run(await ffmpeg(), [
      "-hide_banner",
      "-y",
      "-ss",
      at,
      "-i",
      input,
      "-frames:v",
      "1",
      frame,
    ]);
    const { default: sharp } = await import("sharp");
    const poster = await sharp(frame)
      .resize({ width: 1280, withoutEnlargement: true })
      .webp({ quality: IMAGE_QUALITY })
      .toBuffer();
    const posterFile = optimizedPath(objectPath, "poster.webp");
    await storage.upload(posterFile, poster, "image/webp");
    return {
      variants,
      poster: urlOf(storage, posterFile),
      width: info.width,
      height: info.height,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Finds the library entry of a file (the admin writes it just after the upload), waiting a few
 * seconds if needed; creates it for a file added another way (console, script).
 */
export async function mediaEntry(
  db: Firestore,
  objectPath: string,
  fallback: Omit<MediaDoc, "createdAt">,
): Promise<FirebaseFirestore.DocumentReference> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const snap = await db
      .collection(COLLECTIONS.media)
      .where("path", "==", objectPath)
      .limit(1)
      .get();
    if (snap.docs[0]) return snap.docs[0].ref;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const ref = db.collection(COLLECTIONS.media).doc();
  await ref.set({ ...fallback, createdAt: new Date().toISOString() });
  return ref;
}

/** Object path of a Firebase Storage URL (download URL with token, public URL, emulator URL). */
export function storagePathOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const firebase = /^\/v0\/b\/[^/]+\/o\/([^/]+)$/.exec(parsed.pathname);
    if (firebase) return decodeURIComponent(firebase[1]!);
    if (parsed.hostname === "storage.googleapis.com") {
      return decodeURIComponent(parsed.pathname.split("/").slice(2).join("/"));
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Adds the optimized copies to every image and video value of published content (pages and
 * settings), so `imageProps` and `videoProps` render `srcset` and `<source>`: values whose `src`
 * is a library file with `variants`. Returns a new value.
 */
export function withVariants<T>(value: T, library: Map<string, MediaDoc>): T {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== "object") return node;
    const record = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) out[key] = visit(child);
    if (typeof record.src === "string") {
      const media = library.get(storagePathOf(record.src) ?? "");
      if (media?.variants?.length) {
        out.variants = media.variants;
        if (media.poster && !record.poster && media.contentType.startsWith("video/")) {
          out.poster = media.poster;
        }
      }
    }
    return out;
  };
  return visit(value) as T;
}
