import { existsSync } from "node:fs";
import path from "node:path";
import {
  type CheckLevel,
  countBySeverity,
  formatAgent,
  formatJson,
  formatSarif,
  type HookClient,
  type OutputFormat,
  postToolUseHook,
  projectDeclaresHooks,
  runCheck,
  stopHook,
  toCursorResult,
  writeReport,
} from "@openflow/check";
import { CliError, cliVersion, log, readStdin, siteDir } from "../util.js";
import { buildSite } from "./build.js";

export interface CheckCommandOptions {
  level?: CheckLevel;
  format?: OutputFormat;
  cwd?: string;
  /** For `build`: run `next build` first (default when `out/` is missing). */
  build?: boolean;
}

/** Runs the OpenFlow Standard checks; returns the number of errors. */
export async function check(files: string[], options: CheckCommandOptions): Promise<number> {
  const site = siteDir(options.cwd);
  const level = options.level ?? "render";
  if (level === "build" && (options.build || !existsSync(path.join(site, "out")))) {
    await buildSite(site, {});
  }
  const result = await runCheck({
    siteDir: site,
    level,
    files: files.length > 0 ? files.map((f) => path.resolve(f)) : undefined,
  });
  const format = options.format ?? "agent";
  if (format === "json") console.log(formatJson(result.issues));
  else if (format === "sarif") console.log(formatSarif(result.issues, await cliVersion()));
  else console.log(formatAgent(result.issues, { max: 100 }));
  if (level !== "fast") {
    const report = await writeReport(site, result);
    if (format === "agent") log.info(`Rapport : ${path.relative(process.cwd(), report)}`);
  }
  return countBySeverity(result.issues).errors;
}

/**
 * `openflow hook <event>`: entry point of the AI tools' hooks (reads the hook JSON on stdin). Claude
 * Code, Codex and GitHub Copilot CLI share one format; `--client cursor` answers in Cursor's.
 * With `--source plugin`, stays silent when the project already declares the hooks itself.
 */
export async function hook(
  event: string,
  options: { source?: string; client?: string },
): Promise<number> {
  const client = (options.client ?? "claude") as HookClient;
  if (client !== "claude" && client !== "cursor")
    throw new CliError(`Outil inconnu : ${options.client} (claude | cursor)`);
  // Only Claude Code also runs the project's own hooks (.claude/settings.json); Codex and Copilot CLI
  // set PLUGIN_ROOT for the plugins they run.
  const claudeCode =
    client === "claude" && !process.env.PLUGIN_ROOT && !process.env.COPILOT_PLUGIN_ROOT;
  if (
    options.source === "plugin" &&
    claudeCode &&
    (await projectDeclaresHooks(process.env.CLAUDE_PROJECT_DIR))
  )
    return 0;
  let input: Record<string, unknown> = {};
  try {
    const raw = await readStdin();
    input = raw ? JSON.parse(raw) : {};
  } catch {
    return 0; // Never block the agent because of a malformed hook payload.
  }
  let result: { exitCode: number; stdout?: string; stderr?: string };
  try {
    if (event === "post-tool-use") result = await postToolUseHook(input);
    else if (event === "stop") result = await stopHook(input);
    else throw new CliError(`Événement de hook inconnu : ${event} (post-tool-use | stop)`);
  } catch (error) {
    if (error instanceof CliError) throw error;
    // A crash of the checker must not block the agent; report it without failing.
    console.log(
      JSON.stringify(
        client === "cursor"
          ? {}
          : { systemMessage: `OpenFlow check indisponible : ${(error as Error).message}` },
      ),
    );
    return 0;
  }
  if (client === "cursor") result = toCursorResult(event, result);
  if (result.stdout) process.stdout.write(`${result.stdout}\n`);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  return result.exitCode;
}
