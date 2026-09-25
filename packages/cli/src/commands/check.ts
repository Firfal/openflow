import { existsSync } from "node:fs";
import path from "node:path";
import {
  type CheckLevel,
  countBySeverity,
  formatAgent,
  formatJson,
  formatSarif,
  type OutputFormat,
  postToolUseHook,
  projectDeclaresHooks,
  runCheck,
  stopHook,
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
 * `openflow hook <event>`: Claude Code hook entry point (reads the hook JSON on stdin).
 * With `--source plugin`, stays silent when the project already declares the hooks itself.
 */
export async function hook(event: string, options: { source?: string }): Promise<number> {
  if (options.source === "plugin" && (await projectDeclaresHooks(process.env.CLAUDE_PROJECT_DIR)))
    return 0;
  let input: Record<string, unknown> = {};
  try {
    const raw = await readStdin();
    input = raw ? JSON.parse(raw) : {};
  } catch {
    return 0; // Never block Claude because of a malformed hook payload.
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
      JSON.stringify({
        systemMessage: `OpenFlow check indisponible : ${(error as Error).message}`,
      }),
    );
    return 0;
  }
  if (result.stdout) process.stdout.write(`${result.stdout}\n`);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  return result.exitCode;
}
