// Compares two runs of the UX audit (tests/e2e/audit.test.ts):
//   node tests/e2e/audit-compare.mjs before after
import { readFileSync } from "node:fs";
import path from "node:path";

const dir = (tag) => path.join(import.meta.dirname, "screenshots", "audit", tag);
const load = (tag) => JSON.parse(readFileSync(path.join(dir(tag), "metrics.json"), "utf8"));

/** Totals of a run: what the admin-ui skill's « Auditer » section asks to watch. */
function summary(metrics) {
  const sizes = new Set();
  const weights = new Set();
  const heads = new Set();
  const publish = new Set();
  const scale = {};
  let offGrid = 0;
  let small = 0;
  const smallNames = new Map();
  const axe = new Map();
  let consoleErrors = 0;
  for (const [key, m] of Object.entries(metrics)) {
    for (const s of m.fontSizes) sizes.add(s);
    for (const w of m.fontWeights) weights.add(w);
    const [name, rest] = key.split("@");
    const width = rest.split("-")[0];
    if (!name.startsWith("editor") && !name.startsWith("dialog")) {
      if (m.headHeight) heads.add(`${m.headHeight}px`);
      if (m.publishTop != null) publish.add(`${m.publishTop}px`);
    }
    if (name === "editor-open" && m.canvasScale != null) scale[width] = m.canvasScale;
    offGrid += m.offGrid;
    small += m.smallTargets.length;
    for (const t of m.smallTargets) smallNames.set(t, (smallNames.get(t) ?? 0) + 1);
    for (const v of m.axe ?? []) axe.set(v.split(" ")[0], (axe.get(v.split(" ")[0]) ?? 0) + 1);
    consoleErrors += m.consoleErrors;
  }
  return {
    captures: Object.keys(metrics).length,
    "échelle de la page (editor-open)": scale,
    "tailles de texte": [...sizes].sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b)),
    graisses: [...weights].sort(),
    "hauteurs d'en-tête": [...heads],
    "positions de Publier": [...publish],
    "espacements hors grille (total)": offGrid,
    "cibles < 24 px (total)": small,
    "cibles < 24 px (les plus fréquentes)": [...smallNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([n, c]) => `${n} ×${c}`),
    "violations axe sérieuses": Object.fromEntries(axe),
    "erreurs de console": consoleErrors,
  };
}

const [a, b] = process.argv.slice(2);
if (!a) {
  console.error("Usage : node audit-compare.mjs <avant> [après]");
  process.exit(1);
}
const before = summary(load(a));
const after = b ? summary(load(b)) : undefined;
for (const [label, value] of Object.entries(before)) {
  const show = (v) => (typeof v === "object" ? JSON.stringify(v) : String(v));
  console.log(
    `${label}\n  ${a} : ${show(value)}${after ? `\n  ${b} : ${show(after[label])}` : ""}`,
  );
}
