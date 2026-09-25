import type { Issue } from "@openflow/core";
import { RULES, ruleDocPath } from "./rules.js";

export type OutputFormat = "agent" | "json" | "sarif";

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      (a.file ?? "").localeCompare(b.file ?? "") ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.rule.localeCompare(b.rule),
  );
}

/** Removes exact duplicates (same rule, file, line and message). */
export function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((entry) => {
    const key = `${entry.rule}|${entry.file}|${entry.line}|${entry.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function countBySeverity(issues: Issue[]) {
  return {
    errors: issues.filter((entry) => entry.severity === "error").length,
    warnings: issues.filter((entry) => entry.severity === "warning").length,
  };
}

/**
 * Compact report for AI coding agents: one line per problem with `file:line`, then the fix.
 * Fix hints are printed once per rule to save tokens.
 */
export function formatAgent(
  issues: Issue[],
  options: { max?: number; title?: string } = {},
): string {
  const max = options.max ?? 25;
  const sorted = sortIssues(dedupe(issues));
  const { errors, warnings } = countBySeverity(sorted);
  if (sorted.length === 0)
    return `${options.title ?? "OpenFlow check"} : conforme à la norme OFS ✓`;
  const lines = [
    `${options.title ?? "OpenFlow check"} : ${errors} erreur(s), ${warnings} avertissement(s) — norme OFS`,
  ];
  const hinted = new Set<string>();
  for (const entry of sorted.slice(0, max)) {
    const where = entry.file ? `${entry.file}${entry.line ? `:${entry.line}` : ""} ` : "";
    lines.push(
      `${entry.severity === "error" ? "✖" : "⚠"} ${entry.rule} ${where}— ${entry.message}`,
    );
    if (entry.hint && !hinted.has(entry.rule)) {
      hinted.add(entry.rule);
      lines.push(`  → ${entry.hint} (doc : ${ruleDocPath(entry.rule)})`);
    }
  }
  if (sorted.length > max)
    lines.push(
      `… et ${sorted.length - max} autre(s). Relancez \`openflow check\` après correction.`,
    );
  return lines.join("\n");
}

export function formatJson(issues: Issue[]): string {
  const sorted = sortIssues(dedupe(issues));
  return JSON.stringify({ ...countBySeverity(sorted), issues: sorted }, null, 2);
}

/** SARIF 2.1.0 for GitHub code scanning. */
export function formatSarif(issues: Issue[], version: string): string {
  const sorted = sortIssues(dedupe(issues));
  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "openflow-check",
              version,
              informationUri: "https://github.com/Firfal/openflow",
              rules: RULES.map((rule) => ({
                id: rule.id,
                name: rule.title,
                shortDescription: { text: rule.title },
                fullDescription: { text: rule.why },
                help: { text: rule.fix },
                defaultConfiguration: { level: rule.severity === "error" ? "error" : "warning" },
              })),
            },
          },
          results: sorted.map((entry) => ({
            ruleId: entry.rule,
            level: entry.severity === "error" ? "error" : "warning",
            message: { text: entry.hint ? `${entry.message} ${entry.hint}` : entry.message },
            locations: entry.file
              ? [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: entry.file.replaceAll("\\", "/") },
                      region: entry.line
                        ? { startLine: entry.line, startColumn: entry.column ?? 1 }
                        : undefined,
                    },
                  },
                ]
              : [],
          })),
        },
      ],
    },
    null,
    2,
  );
}
