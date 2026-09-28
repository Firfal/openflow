// The OpenFlow plugin for every AI coding tool, from one source: the Claude Code manifest
// (plugins/openflow/.claude-plugin/plugin.json) and the skills (plugins/openflow/skills/*/SKILL.md).
// Writes the manifests the other tools read, and checks what every tool relies on: skills in the
// Agent Skills format, the same version everywhere, hook scripts present and executable.
// `--check` fails when a generated file is out of date or a check fails (used in CI).
import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const PLUGIN_DIR = "plugins/openflow";
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));

const plugin = json(`${PLUGIN_DIR}/.claude-plugin/plugin.json`);
const marketplace = json(".claude-plugin/marketplace.json");
const problems = [];

// Skills (https://agentskills.io/specification) ---------------------------------------------------
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const skillsDir = path.join(root, PLUGIN_DIR, "skills");
const skills = readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const rel = `${PLUGIN_DIR}/skills/${entry.name}/SKILL.md`;
    const text = existsSync(path.join(root, rel)) ? read(rel) : "";
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
    const field = (key) => new RegExp(`^${key}:\\s*(.*)$`, "m").exec(front)?.[1]?.trim() ?? "";
    const skill = { dir: entry.name, rel, name: field("name"), description: field("description") };
    if (!text) problems.push(`${rel} : fichier absent`);
    else if (!front) problems.push(`${rel} : en-tête YAML (---) absent`);
    if (skill.name !== entry.name) problems.push(`${rel} : name doit valoir « ${entry.name} »`);
    if (!NAME.test(skill.name) || skill.name.length > 64)
      problems.push(`${rel} : name en minuscules, chiffres et tirets (64 caractères au plus)`);
    if (!skill.description || skill.description.length > 1024)
      problems.push(`${rel} : description obligatoire (1024 caractères au plus)`);
    return skill;
  });

// Hooks: every script a hook runs exists and is executable --------------------------------------
const hooks = json(`${PLUGIN_DIR}/hooks/hooks.json`);
for (const groups of Object.values(hooks.hooks ?? {})) {
  for (const group of groups) {
    for (const hook of group.hooks ?? []) {
      const script = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/.exec(hook.command ?? "")?.[1];
      if (!script) continue;
      try {
        accessSync(path.join(root, PLUGIN_DIR, script), constants.X_OK);
      } catch {
        problems.push(`${PLUGIN_DIR}/${script} : script de hook absent ou non exécutable`);
      }
    }
  }
}
for (const skill of skills) {
  const scripts = path.join(skillsDir, skill.dir, "scripts");
  if (!existsSync(scripts)) continue;
  for (const file of readdirSync(scripts).filter((name) => name.endsWith(".sh"))) {
    try {
      accessSync(path.join(scripts, file), constants.X_OK);
    } catch {
      problems.push(
        `${PLUGIN_DIR}/skills/${skill.dir}/scripts/${file} : non exécutable (chmod +x)`,
      );
    }
  }
}

// The marketplace lists this plugin -------------------------------------------------------------
const entry = marketplace.plugins?.find((p) => p.name === plugin.name);
if (!entry)
  problems.push(`.claude-plugin/marketplace.json : le plugin « ${plugin.name} » n'y est pas`);
else if (entry.source !== `./${PLUGIN_DIR}`)
  problems.push(`.claude-plugin/marketplace.json : source attendue « ./${PLUGIN_DIR} »`);

// Generated manifests ---------------------------------------------------------------------------
const outputs = new Map();
const about = {
  name: plugin.name,
  version: plugin.version,
  description: plugin.description,
  author: plugin.author,
  homepage: plugin.homepage,
  repository: plugin.repository,
  license: plugin.license,
  keywords: plugin.keywords,
};

// Codex and GitHub Copilot CLI read the Claude Code files themselves (.claude-plugin/*, skills/,
// hooks/hooks.json). Cursor reads its own manifests (https://cursor.com/docs/reference/plugins) and
// hooks (https://cursor.com/docs/hooks): same script, answers in Cursor's format.
const CURSOR_EVENTS = { SessionStart: "sessionStart", PostToolUse: "postToolUse", Stop: "stop" };
const cursorHooks = {};
for (const [event, groups] of Object.entries(hooks.hooks ?? {})) {
  const name = CURSOR_EVENTS[event];
  if (!name) problems.push(`hooks.json : événement ${event} sans équivalent Cursor`);
  cursorHooks[name] = groups.flatMap((group) =>
    (group.hooks ?? []).map((hook) => ({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: variables the tools expand
      command: `${hook.command.replaceAll("${CLAUDE_PLUGIN_ROOT}", "${CURSOR_PLUGIN_ROOT}")} cursor`,
      ...(event === "PostToolUse" ? { matcher: "Write" } : {}),
    })),
  );
}
outputs.set(`${PLUGIN_DIR}/hooks/cursor-hooks.json`, { version: 1, hooks: cursorHooks });
outputs.set(`${PLUGIN_DIR}/.cursor-plugin/plugin.json`, {
  ...about,
  skills: "./skills/",
  hooks: "./hooks/cursor-hooks.json",
});
outputs.set(".cursor-plugin/marketplace.json", {
  name: marketplace.name,
  owner: marketplace.owner,
  metadata: marketplace.metadata,
  plugins: [
    {
      name: plugin.name,
      source: entry?.source,
      description: entry?.description ?? plugin.description,
      version: plugin.version,
      category: entry?.category,
      tags: entry?.tags,
    },
  ],
});

// Written as Biome formats them, so that `pnpm lint` accepts the generated files.
const biome = path.join(root, "node_modules/@biomejs/biome/bin/biome");
const format = (rel, text) =>
  execFileSync(process.execPath, [biome, "format", `--stdin-file-path=${rel}`], {
    cwd: root,
    input: text,
    encoding: "utf8",
  });

let stale = 0;
for (const [rel, value] of outputs) {
  const content = format(rel, typeof value === "string" ? value : JSON.stringify(value, null, 2));
  const file = path.join(root, rel);
  const current = existsSync(file) ? readFileSync(file, "utf8") : undefined;
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
for (const problem of problems) console.error(`✖ ${problem}`);
if (problems.length > 0 || stale > 0) {
  if (stale > 0) console.error(`${stale} manifeste(s) obsolète(s) : lancez \`pnpm gen:docs\`.`);
  process.exit(1);
}
