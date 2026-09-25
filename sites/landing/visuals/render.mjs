// Renders the HTML sources of visuals/ to images in public/ (same fonts as the site).
//   node visuals/render.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "..", "public");

const jobs = [
  // Transparent diagram shown on the ink section (2x for sharp text).
  {
    source: "architecture.html",
    size: [1200, 700],
    out: "images/architecture.webp",
    transparent: true,
  },
  // Open Graph / social card.
  { source: "og.html", size: [1200, 630], out: "og.png", scale: 1 },
];

const browser = await chromium.launch();
for (const job of jobs) {
  const [width, height] = job.size;
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: job.scale ?? 2,
  });
  await page.goto(pathToFileURL(path.join(here, job.source)).href);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ omitBackground: Boolean(job.transparent) });
  const target = path.join(publicDir, job.out);
  const image = sharp(png);
  await (job.out.endsWith(".webp")
    ? image.webp({ quality: 90, alphaQuality: 100 })
    : image.png({ compressionLevel: 9 })
  ).toFile(target);
  console.log(`✓ ${job.out}`);
  await page.close();
}
await browser.close();
