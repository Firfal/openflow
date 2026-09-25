import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  compareRulesBlock,
  FIRESTORE_RULES_BLOCK,
  type Issue,
  STORAGE_RULES_BLOCK,
} from "@openflow/core";
import { getRule } from "./rules.js";

function issue(ruleId: string, file: string, message: string, line?: number): Issue {
  const rule = getRule(ruleId);
  return { rule: rule.id, severity: rule.severity, message, file, line, hint: rule.fix };
}

/** Files whose modification should trigger the project-level checks. */
export const PROJECT_FILES = [
  "firebase.json",
  "firestore.rules",
  "storage.rules",
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "middleware.ts",
  "middleware.js",
  "proxy.ts",
  "proxy.js",
  "src/middleware.ts",
  "src/proxy.ts",
];

interface HostingConfig {
  public?: string;
  rewrites?: Array<{ source?: string; destination?: string }>;
}

/** Project-level checks (level `fast`): OF-301 (next.config, middleware) and OF-303 (Firebase). */
export async function checkProject(siteDir: string): Promise<Issue[]> {
  const issues: Issue[] = [];

  const nextConfig = ["next.config.ts", "next.config.mjs", "next.config.js"].find((file) =>
    existsSync(path.join(siteDir, file)),
  );
  if (!nextConfig) {
    issues.push(
      issue(
        "OF-301",
        "next.config.ts",
        'next.config.ts introuvable (il doit contenir `output: "export"`).',
      ),
    );
  } else {
    const content = await readFile(path.join(siteDir, nextConfig), "utf8");
    if (!/output\s*:\s*["']export["']/.test(content)) {
      issues.push(
        issue(
          "OF-301",
          nextConfig,
          '`output: "export"` absent : le site doit être exporté en HTML statique.',
        ),
      );
    }
    if (!/unoptimized\s*:\s*true/.test(content) && !/loader(File)?\s*:/.test(content)) {
      issues.push(
        issue(
          "OF-301",
          nextConfig,
          "`images.unoptimized: true` absent : le loader next/image par défaut ne fonctionne pas en export statique.",
        ),
      );
    }
  }

  for (const file of [
    "middleware.ts",
    "middleware.js",
    "proxy.ts",
    "proxy.js",
    "src/middleware.ts",
    "src/proxy.ts",
  ]) {
    if (existsSync(path.join(siteDir, file))) {
      issues.push(
        issue(
          "OF-301",
          file,
          `${file} : le middleware/proxy n'existe pas en export statique (utilisez les redirections de firebase.json).`,
        ),
      );
    }
  }

  const firebaseJsonPath = path.join(siteDir, "firebase.json");
  if (!existsSync(firebaseJsonPath)) {
    issues.push(issue("OF-303", "firebase.json", "firebase.json introuvable."));
  } else {
    let firebaseJson: any;
    try {
      firebaseJson = JSON.parse(await readFile(firebaseJsonPath, "utf8"));
    } catch (error) {
      issues.push(issue("OF-303", "firebase.json", `JSON invalide : ${(error as Error).message}`));
    }
    if (firebaseJson) {
      const hostings: HostingConfig[] = Array.isArray(firebaseJson.hosting)
        ? firebaseJson.hosting
        : firebaseJson.hosting
          ? [firebaseJson.hosting]
          : [];
      const site = hostings.find((entry) => entry.public === "out");
      if (!site) {
        issues.push(
          issue("OF-303", "firebase.json", 'Aucune configuration hosting avec `"public": "out"`.'),
        );
      } else if (
        !site.rewrites?.some(
          (rewrite) =>
            rewrite.source === "/admin/**" && rewrite.destination === "/admin/index.html",
        )
      ) {
        issues.push(
          issue("OF-303", "firebase.json", "Réécriture `/admin/**` → `/admin/index.html` absente."),
        );
      }
      if (firebaseJson.firestore?.rules !== "firestore.rules") {
        issues.push(
          issue(
            "OF-303",
            "firebase.json",
            "`firestore.rules` doit être déclaré dans firebase.json.",
          ),
        );
      }
      if (firebaseJson.storage?.rules !== "storage.rules" && !Array.isArray(firebaseJson.storage)) {
        issues.push(
          issue("OF-303", "firebase.json", "`storage.rules` doit être déclaré dans firebase.json."),
        );
      }
    }
  }

  for (const [file, block] of [
    ["firestore.rules", FIRESTORE_RULES_BLOCK],
    ["storage.rules", STORAGE_RULES_BLOCK],
  ] as const) {
    const full = path.join(siteDir, file);
    if (!existsSync(full)) {
      issues.push(issue("OF-303", file, `${file} introuvable.`));
      continue;
    }
    const status = compareRulesBlock(await readFile(full, "utf8"), block);
    if (status === "missing") {
      issues.push(issue("OF-303", file, "Bloc `// BEGIN openflow` … `// END openflow` absent."));
    } else if (status === "modified") {
      issues.push(
        issue("OF-303", file, "Le bloc de règles OpenFlow a été modifié (sécurité propriétaire)."),
      );
    }
  }
  return issues;
}
