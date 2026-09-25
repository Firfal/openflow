import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG_FILES, findSiteRoot } from "@openflow/core/node";
import { countBySeverity, formatAgent } from "./format.js";
import { PROJECT_FILES } from "./project.js";
import { runCheck, writeReport } from "./run.js";

/** What a Claude Code hook command should do: exit code plus stdout/stderr payloads. */
export interface HookResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

/** Subset of the JSON Claude Code sends on stdin to hook commands. */
export interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string };
  stop_hook_active?: boolean;
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

/** PostToolUse (Write|Edit|MultiEdit): fast check of the edited file. Exit 2 feeds errors back. */
export async function postToolUseHook(input: HookInput): Promise<HookResult> {
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!target) return { exitCode: 0 };
  const file = path.resolve(input.cwd ?? process.cwd(), target);
  if (IGNORED.test(file)) return { exitCode: 0 };
  const base = path.basename(file);
  if (!RELEVANT.test(file) && !PROJECT_FILES.includes(base)) return { exitCode: 0 };
  const siteDir = findSiteRoot(path.dirname(file));
  if (!siteDir) return { exitCode: 0 };

  const result = await runCheck({ siteDir, level: "fast", files: [file] });
  const { errors } = countBySeverity(result.issues);
  const rel = path.relative(siteDir, file);
  if (errors > 0) {
    return {
      exitCode: 2,
      stderr: `${formatAgent(result.issues, { title: `OpenFlow — ${rel}` })}\nCorrigez ces points maintenant (le site doit rester éditable par son propriétaire).`,
    };
  }
  if (result.issues.length > 0) {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: formatAgent(result.issues, { title: `OpenFlow — ${rel}` }),
        },
      }),
    };
  }
  return { exitCode: 0 };
}

/** Finds OpenFlow sites in `cwd` (itself, a parent, or a direct/second-level sub-directory). */
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
      else if (depth > 1) await scan(full, depth - 1);
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
  const sites = await findSites(input.cwd ?? process.cwd());
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
  const attempts = (state.sessionId === input.session_id ? state.attempts : 0) + 1;
  await mkdir(stateDir, { recursive: true });
  await writeFile(stateFile, JSON.stringify({ sessionId: input.session_id, attempts }), "utf8");
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
