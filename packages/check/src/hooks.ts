import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG_FILES, findSiteRoot } from "@openflow/core/node";
import { countBySeverity, formatAgent } from "./format.js";
import { PROJECT_FILES } from "./project.js";
import { runCheck, writeReport } from "./run.js";

/** What a hook command should do: exit code plus stdout/stderr payloads. */
export interface HookResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

/**
 * Subset of the JSON the AI coding tools send on stdin to hook commands. Claude Code's format, also
 * used by Codex (an edit is an `apply_patch` whose text is in `tool_input.command`) and GitHub Copilot
 * CLI (`tool_input.path`); Cursor adds `conversation_id` and `workspace_roots`.
 */
export interface HookInput {
  session_id?: string;
  conversation_id?: string;
  cwd?: string;
  workspace_roots?: string[];
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string; path?: string; command?: unknown };
  file_path?: string;
  stop_hook_active?: boolean;
}

/** Tools whose hook answers the CLI writes. Codex and Copilot CLI read Claude Code's. */
export type HookClient = "claude" | "cursor";

/** The files an edit tool wrote, relative to the hook's directory or absolute. */
export function editedFiles(input: HookInput): string[] {
  const tool = input.tool_input;
  const direct = tool?.file_path ?? tool?.notebook_path ?? tool?.path ?? input.file_path;
  if (direct) return [direct];
  const command = tool?.command;
  const patch = Array.isArray(command)
    ? command.join("\n")
    : typeof command === "string"
      ? command
      : "";
  const files = [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm)].map(
    (match) => match[1]!.trim(),
  );
  return [...new Set(files)];
}

/** The directory the agent works in. */
export function hookCwd(input: HookInput): string {
  return (
    input.cwd ??
    input.workspace_roots?.[0] ??
    process.env.CLAUDE_PROJECT_DIR ??
    process.env.CURSOR_PROJECT_DIR ??
    process.cwd()
  );
}

/** Maximum number of times the Stop hook sends Claude back to work on the same session. */
export const MAX_STOP_ATTEMPTS = 3;

const IGNORED = /[\\/](node_modules|\.next|out|dist|\.openflow|\.firebase)[\\/]/;
const RELEVANT = /\.(tsx?|jsx?|mjs|cjs|json|rules)$/;

/**
 * When the plugin hook runs in a project whose own `.claude/settings.json` already declares the
 * OpenFlow hooks (sites created from the template), the plugin hook stays silent to avoid
 * reporting everything twice.
 */
export async function projectDeclaresHooks(projectDir: string | undefined): Promise<boolean> {
  if (!projectDir) return false;
  const file = path.join(projectDir, ".claude", "settings.json");
  if (!existsSync(file)) return false;
  try {
    const settings = JSON.parse(await readFile(file, "utf8")) as {
      hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
    };
    const commands = Object.values(settings.hooks ?? {}).flatMap((groups) =>
      groups.flatMap((group) => (group.hooks ?? []).map((hook) => hook.command ?? "")),
    );
    return commands.some((command) => /openflow["']?\s+hook\b/.test(command));
  } catch {
    return false;
  }
}

/** PostToolUse (Write|Edit|MultiEdit): fast check of the edited files. Exit 2 feeds errors back. */
export async function postToolUseHook(input: HookInput): Promise<HookResult> {
  const cwd = hookCwd(input);
  const errors: string[] = [];
  const notes: string[] = [];
  for (const target of editedFiles(input)) {
    const file = path.resolve(cwd, target);
    if (IGNORED.test(file)) continue;
    const base = path.basename(file);
    if (!RELEVANT.test(file) && !PROJECT_FILES.includes(base)) continue;
    const siteDir = findSiteRoot(path.dirname(file));
    if (!siteDir) continue;

    const result = await runCheck({ siteDir, level: "fast", files: [file] });
    if (result.issues.length === 0) continue;
    const report = formatAgent(result.issues, {
      title: `OpenFlow — ${path.relative(siteDir, file)}`,
    });
    if (countBySeverity(result.issues).errors > 0) errors.push(report);
    else notes.push(report);
  }
  if (errors.length > 0) {
    return {
      exitCode: 2,
      stderr: `${[...errors, ...notes].join("\n\n")}\nCorrigez ces points maintenant (le site doit rester éditable par son propriétaire).`,
    };
  }
  if (notes.length > 0) {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: notes.join("\n\n") },
      }),
    };
  }
  return { exitCode: 0 };
}

/**
 * Finds OpenFlow sites in `cwd`: itself, a parent, a direct or second-level sub-directory, or the
 * `sites/` folder of an OpenFlow repository cloned in it (`openflow/sites/<site>`).
 */
export async function findSites(cwd: string): Promise<string[]> {
  const root = findSiteRoot(cwd);
  if (root) return [root];
  const sites: string[] = [];
  const scan = async (dir: string, depth: number) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules")
        continue;
      const full = path.join(dir, entry.name);
      if (CONFIG_FILES.some((file) => existsSync(path.join(full, file)))) sites.push(full);
      else if (depth > 1 || entry.name === "sites") await scan(full, depth - 1);
    }
  };
  await scan(cwd, 2);
  return sites;
}

interface StopState {
  sessionId?: string;
  attempts: number;
}

async function readState(file: string): Promise<StopState> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as StopState;
  } catch {
    return { attempts: 0 };
  }
}

/**
 * Stop: full source + render check of every site in the workspace. While errors remain, Claude
 * is sent back to work (`decision: "block"`), at most {@link MAX_STOP_ATTEMPTS} times per session.
 */
export async function stopHook(input: HookInput): Promise<HookResult> {
  const sites = await findSites(hookCwd(input));
  const sessionId = input.session_id ?? input.conversation_id;
  if (sites.length === 0) return { exitCode: 0 };

  const reports: string[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  for (const siteDir of sites) {
    const result = await runCheck({ siteDir, level: "render" });
    await writeReport(siteDir, result).catch(() => undefined);
    const { errors, warnings } = countBySeverity(result.issues);
    totalErrors += errors;
    totalWarnings += warnings;
    if (errors > 0) {
      const label = sites.length > 1 ? `OpenFlow — ${path.basename(siteDir)}` : "OpenFlow";
      reports.push(
        formatAgent(
          result.issues.filter((entry) => entry.severity === "error"),
          { title: label },
        ),
      );
    }
  }

  const stateDir = path.join(sites[0]!, ".openflow");
  const stateFile = path.join(stateDir, "stop-hook.json");
  if (totalErrors === 0) {
    await rm(stateFile, { force: true });
    return totalWarnings > 0
      ? {
          exitCode: 0,
          stdout: JSON.stringify({
            systemMessage: `OpenFlow : site conforme à la norme OFS (${totalWarnings} avertissement(s), voir .openflow/report.md).`,
          }),
        }
      : { exitCode: 0 };
  }

  const state = await readState(stateFile);
  const attempts = (state.sessionId === sessionId ? state.attempts : 0) + 1;
  await mkdir(stateDir, { recursive: true });
  await writeFile(stateFile, JSON.stringify({ sessionId, attempts }), "utf8");
  if (attempts > MAX_STOP_ATTEMPTS) {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        systemMessage: `OpenFlow : ${totalErrors} erreur(s) de conformité restent après ${MAX_STOP_ATTEMPTS} tentatives. Voir .openflow/report.md ou lancez \`npx openflow check\`.`,
      }),
    };
  }
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      decision: "block",
      reason: `${reports.join("\n\n")}\n\nLe site n'est pas encore conforme à la norme OpenFlow (tentative ${attempts}/${MAX_STOP_ATTEMPTS}). Corrigez ces erreurs, puis terminez.`,
    }),
  };
}

function parseJson(text: string | undefined): Record<string, unknown> | undefined {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The same answer in Cursor's format (https://cursor.com/docs/hooks): JSON on stdout,
 * `additional_context` for the agent after an edit, `followup_message` to send it back to work when
 * it stops.
 */
export function toCursorResult(event: string, result: HookResult): HookResult {
  const payload = parseJson(result.stdout);
  if (event === "post-tool-use") {
    const context =
      result.exitCode === 2
        ? result.stderr
        : (payload?.hookSpecificOutput as { additionalContext?: string } | undefined)
            ?.additionalContext;
    return { exitCode: 0, stdout: JSON.stringify(context ? { additional_context: context } : {}) };
  }
  if (event === "stop") {
    return {
      exitCode: 0,
      stdout: JSON.stringify(
        payload?.decision === "block" ? { followup_message: payload.reason } : {},
      ),
    };
  }
  return result;
}
