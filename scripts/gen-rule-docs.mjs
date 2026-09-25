// Generates the OpenFlow Standard documentation from the rule registry (single source of truth):
//   docs/norme/README.md + docs/norme/OF-xxx.md             (humans)
//   packages/core/docs/rules/OF-xxx.md                      (agents, installed with @openflow/core)
//   plugins/openflow/skills/openflow/references/*.md        (Claude Code plugin)
// `--check` fails when a generated file is out of date (used in CI).
// Requires `pnpm build` (reads packages/check/dist).
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { RULES } = await import(path.join(root, "packages/check/dist/rules.js"));
const checkOnly = process.argv.includes("--check");

const LEVELS = {
  fast: "rapide (à chaque modification)",
  render: "rendu (fin de tâche)",
  build: "build (avant livraison)",
};
const SEVERITY = { error: "erreur", warning: "avertissement" };

function rulePage(rule) {
  const lines = [
    `# ${rule.id} — ${rule.title}`,
    "",
    `- Gravité : **${SEVERITY[rule.severity]}**`,
    `- Niveau de contrôle : ${LEVELS[rule.level]}`,
    `- Statut : ${rule.status === "active" ? "appliquée" : "prévue (documentée, pas encore vérifiée)"}`,
    "",
    "## Pourquoi",
    "",
    rule.why,
    "",
    "## Comment corriger",
    "",
    rule.fix,
    "",
  ];
  if (rule.bad) lines.push("## À éviter", "", "```tsx", rule.bad, "```", "");
  if (rule.good) lines.push("## À faire", "", "```tsx", rule.good, "```", "");
  lines.push(
    "## Désactiver ponctuellement",
    "",
    `Uniquement si le signalement est un faux positif : \`// openflow-disable-next-line ${rule.id}\` ` +
      `au-dessus de la ligne, ou \`/* openflow-disable ${rule.id} */\` pour tout le fichier. Expliquez pourquoi en commentaire.`,
    "",
  );
  return lines.join("\n");
}

function index() {
  const lines = [
    "# Norme OpenFlow (OFS)",
    "",
    "La norme OpenFlow garantit qu'un site créé par un agent IA (ou un développeur) reste **entièrement",
    "modifiable par son propriétaire**, sûr et publiable en statique sur Firebase Hosting.",
    "",
    "Elle est vérifiée par `openflow check` à trois niveaux :",
    "",
    "| Niveau | Quand | Ce qui est vérifié |",
    "|---|---|---|",
    "| `fast` | À chaque fichier modifié (hook PostToolUse) | Analyse statique : textes, images et liens en dur, API interdites, secrets, config Firebase |",
    "| `render` | En fin de tâche (hook Stop) | Chaque section est affichée avec des **sentinelles** : champs morts, textes cachés en dur, édition sur la page, robustesse aux valeurs limites ; config et contenu de départ |",
    "| `build` | Avant livraison (`openflow deploy`) | `next build` en export statique, puis contrôle du HTML (alt, h1, titre, liens, langue) |",
    "",
    "Les retours sont formatés pour un agent : fichier, ligne, règle, puis correctif. Avec Claude Code, les",
    "hooks renvoient automatiquement les erreurs à l'agent, qui les corrige avant de rendre la main.",
    "",
    "## Règles",
    "",
    "| Règle | Titre | Gravité | Niveau | Statut |",
    "|---|---|---|---|---|",
    ...RULES.map(
      (rule) =>
        `| [${rule.id}](${rule.id}.md) | ${rule.title} | ${SEVERITY[rule.severity]} | ${rule.level} | ${rule.status === "active" ? "appliquée" : "prévue"} |`,
    ),
    "",
    "## Format des retours",
    "",
    "```text",
    "OpenFlow check : 1 erreur(s), 0 avertissement(s) — norme OFS",
    "✖ OF-101 openflow/components/Hero.tsx:14 — Texte en dur « Bienvenue ».",
    "  → Créez un champ (…) puis affichez `{nomDuChamp}` à la place du texte. (doc : node_modules/@openflow/core/docs/rules/OF-101.md)",
    "```",
    "",
    "Formats disponibles : `--format agent` (défaut), `--format json`, `--format sarif` (GitHub code scanning).",
    "",
  ];
  return lines.join("\n");
}

function compactNorme() {
  return [
    "# Norme OFS : aide-mémoire",
    "",
    ...RULES.filter((rule) => rule.status === "active").map(
      (rule) => `- **${rule.id} ${rule.title}** (${SEVERITY[rule.severity]}) — ${rule.fix}`,
    ),
    "",
  ].join("\n");
}

const outputs = new Map();
outputs.set("docs/norme/README.md", index());
for (const rule of RULES) {
  outputs.set(`docs/norme/${rule.id}.md`, rulePage(rule));
  outputs.set(`packages/core/docs/rules/${rule.id}.md`, rulePage(rule));
}
outputs.set("plugins/openflow/skills/openflow/references/norme.md", compactNorme());
for (const name of ["contrat.md", "champs.md"]) {
  outputs.set(
    `plugins/openflow/skills/openflow/references/${name}`,
    await readFile(path.join(root, "packages/core/docs", name), "utf8"),
  );
}

let stale = 0;
for (const [rel, content] of outputs) {
  const file = path.join(root, rel);
  const current = existsSync(file) ? await readFile(file, "utf8") : undefined;
  if (current === content) continue;
  if (checkOnly) {
    console.error(`obsolète : ${rel}`);
    stale++;
    continue;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  console.log(`écrit : ${rel}`);
}
if (checkOnly && stale > 0) {
  console.error(`${stale} fichier(s) de documentation obsolète(s) : lancez \`pnpm gen:docs\`.`);
  process.exit(1);
}
