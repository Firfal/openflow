import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { MediaDoc } from "@openflow/core";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import {
  imageWidths,
  isOriginalMedia,
  optimizeImage,
  optimizeVideo,
  parseVideoInfo,
  renditionsFor,
  type Storage,
  storagePathOf,
  videoArgs,
  withVariants,
} from "../src/media.js";

const dir = mkdtempSync(path.join(tmpdir(), "openflow-media-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function memoryStorage(files: Record<string, Buffer>): Storage & { files: typeof files } {
  return {
    bucketName: "site.firebasestorage.app",
    files,
    download: async (file) => files[file]!,
    upload: async (file, data) => {
      files[file] = data;
    },
  };
}

describe("media optimization", () => {
  it("chooses image widths up to the original, never larger", () => {
    expect(imageWidths(4000)).toEqual([480, 960, 1440, 1920, 2560]);
    expect(imageWidths(1200)).toEqual([480, 960, 1200]);
    expect(imageWidths(300)).toEqual([300]);
  });

  it("makes a 1080p and a 720p video, or one copy for a small source", () => {
    expect(renditionsFor(2160).map((r) => r.size)).toEqual([1080, 720]);
    expect(renditionsFor(1080).map((r) => r.size)).toEqual([1080, 720]);
    expect(renditionsFor(900).map((r) => r.size)).toEqual([900, 720]);
    expect(renditionsFor(721).map((r) => r.size)).toEqual([720]);
    expect(renditionsFor(481).map((r) => r.size)).toEqual([480]);
  });

  it("encodes H.264 with a quality target, a bitrate cap, no sound and fast start", () => {
    const args = videoArgs("in", "out.mp4", renditionsFor(1080)[0]!, { durationSeconds: 20 });
    expect(args.join(" ")).toContain("-an");
    expect(args.join(" ")).toContain("-c:v libx264 -preset slow -crf 22 -maxrate 8M -bufsize 16M");
    expect(args.join(" ")).toContain("-movflags +faststart");
    expect(args.join(" ")).toContain("-fpsmax 30");
    expect(videoArgs("in", "out.mp4", renditionsFor(1080)[0]!, { durationSeconds: 300 })).toContain(
      "medium",
    );
  });

  it("reads duration and size from ffmpeg's report, rotation included", () => {
    const report = `Duration: 00:01:02.50, start: 0.000000, bitrate: 9000 kb/s
  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv), 1920x1080, 8900 kb/s, 29.97 fps
      Side data:
        displaymatrix: rotation of -90.00 degrees`;
    expect(parseVideoInfo(report)).toEqual({ durationSeconds: 62.5, width: 1080, height: 1920 });
  });

  it("finds the object path of Storage URLs, and skips its own copies", () => {
    expect(
      storagePathOf(
        "https://firebasestorage.googleapis.com/v0/b/site.firebasestorage.app/o/cms%2Fmedia%2Fa.jpg?alt=media&token=x",
      ),
    ).toBe("cms/media/a.jpg");
    expect(storagePathOf("https://storage.googleapis.com/site.appspot.com/cms/media/a.jpg")).toBe(
      "cms/media/a.jpg",
    );
    expect(storagePathOf("/images/a.webp")).toBeUndefined();
    expect(isOriginalMedia("cms/media/a.jpg")).toBe(true);
    expect(isOriginalMedia("cms/media/optimized/a/960.webp")).toBe(false);
  });

  it("adds the copies to published values, and nothing else", () => {
    const library = new Map<string, MediaDoc>([
      [
        "cms/media/a.jpg",
        {
          path: "cms/media/a.jpg",
          url: "u",
          name: "a.jpg",
          contentType: "image/jpeg",
          size: 1,
          createdAt: "",
          variants: [{ url: "v480", width: 480, height: 320 }],
        },
      ],
      [
        "cms/media/b.mp4",
        {
          path: "cms/media/b.mp4",
          url: "u",
          name: "b.mp4",
          contentType: "video/mp4",
          size: 1,
          createdAt: "",
          poster: "poster",
          variants: [{ url: "v720", width: 1280, height: 720 }],
        },
      ],
    ]);
    const data = {
      content: [
        {
          type: "Hero",
          props: {
            image: {
              src: "https://firebasestorage.googleapis.com/v0/b/x/o/cms%2Fmedia%2Fa.jpg?alt=media",
              alt: "A",
            },
            video: { src: "https://storage.googleapis.com/x/cms/media/b.mp4" },
            other: { src: "/images/static.webp", alt: "" },
          },
        },
      ],
    };
    const out = withVariants(data, library);
    expect(out.content[0]!.props.image).toMatchObject({ alt: "A", variants: [{ url: "v480" }] });
    expect(out.content[0]!.props.video).toMatchObject({ poster: "poster" });
    expect(out.content[0]!.props.other).toEqual({ src: "/images/static.webp", alt: "" });
    expect(data.content[0]!.props.image).not.toHaveProperty("variants");
  });

  it("makes WebP copies of an image, lighter than the original", async () => {
    const original = await sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 3,
        background: "#808080",
        noise: { type: "gaussian", mean: 128, sigma: 30 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
    const storage = memoryStorage({ "cms/media/photo.jpg": original });
    const result = await optimizeImage(storage, "cms/media/photo.jpg");
    expect(result?.variants?.map((v) => v.width)).toEqual([480, 960, 1440, 1920, 2560]);
    expect(Object.keys(storage.files)).toContain("cms/media/optimized/photo/960.webp");
    for (const variant of result!.variants!) expect(variant.size).toBeLessThan(original.length);
  }, 60_000);

  it("transcodes a video to MP4 with a poster", async () => {
    const source = path.join(dir, "clip.webm");
    execFileSync(ffmpegPath as unknown as string, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=30:duration=2",
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "4M",
      source,
    ]);
    const storage = memoryStorage({ "cms/media/clip.webm": readFileSync(source) });
    const result = await optimizeVideo(storage, "cms/media/clip.webm");
    expect(result?.variants?.map((v) => [v.width, v.height])).toEqual([[1280, 720]]);
    expect(result?.poster).toContain("poster.webp");
    const mp4 = storage.files["cms/media/optimized/clip/720p.mp4"]!;
    // `faststart`: the index (moov) comes before the data (mdat).
    expect(mp4.indexOf("moov")).toBeLessThan(mp4.indexOf("mdat"));
  }, 120_000);
});
