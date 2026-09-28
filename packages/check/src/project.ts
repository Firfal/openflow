import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  compareRulesBlock,
  FIRESTORE_RULES_BLOCK,
  type Issue,
  STORAGE_RULES_BLOCK,
} from "@openflow/core";
import { CONFIG_FILES } from "@openflow/core/node";
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
  rewrites?: Array<{
    source?: string;
    destination?: string;
    run?: { serviceId?: string; region?: string };
  }>;
}

/** Paths of the site's MCP server and of its OAuth discovery (Hosting → `cmsMcp`). */
export const MCP_REWRITES = [
  "/mcp",
  "/mcp/**",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/**",
  "/.well-known/oauth-authorization-server",
];

/** `CMS_REGION` of the functions (`functions/.env*`), `europe-west1` by default. */
async function functionRegions(siteDir: string): Promise<string[]> {
  const dir = path.join(siteDir, "functions");
  const regions = new Set<string>();
  const files = existsSync(dir) ? await readdir(dir) : [];
  for (const file of files) {
    if (!file.startsWith(".env") || file === ".env.local") continue;
    const match = /^CMS_REGION\s*=\s*"?([\w-]+)"?\s*$/m.exec(
      await readFile(path.join(dir, file), "utf8"),
    );
    if (match) regions.add(match[1]!);
  }
  return regions.size > 0 ? [...regions] : ["europe-west1"];
}

/** OF-305: AI access (MCP address and OAuth discovery, `llms.txt`). */
async function checkAiAccess(siteDir: string, site: HostingConfig | undefined): Promise<Issue[]> {
  const issues: Issue[] = [];
  if (site) {
    const regions = await functionRegions(siteDir);
    const missing: string[] = [];
    for (const source of MCP_REWRITES) {
      const rewrite = site.rewrites?.find((entry) => entry.source === source);
      if (rewrite?.run?.serviceId !== "cmsmcp") {
        missing.push(source);
      } else if (!regions.includes(rewrite.run.region ?? "")) {
        issues.push(
          issue(
            "OF-305",
            "firebase.json",
            `Réécriture ${source} : région « ${rewrite.run.region} » différente de celle des fonctions (${regions.join(", ")}).`,
          ),
        );
      }
    }
    if (missing.length > 0) {
      issues.push(
        issue(
          "OF-305",
          "firebase.json",
          `Réécritures vers le serveur MCP (service cmsmcp) absentes : ${missing.join(", ")}.`,
        ),
      );
    }
  }
  // With collections (articles, events…), the RSS feed of their items too.
  const config = CONFIG_FILES.map((file) => path.join(siteDir, file)).find((file) =>
    existsSync(file),
  );
  const hasCollections =
    config !== undefined && /\bcollections\s*:/.test(await readFile(config, "utf8"));
  for (const route of ["llms.txt", "llms-full.txt", ...(hasCollections ? ["rss.xml"] : [])]) {
    const found = ["app", "src/app"].some((base) =>
      ["route.ts", "route.js", "route.tsx"].some((file) =>
        existsSync(path.join(siteDir, base, route, file)),
      ),
    );
    if (!found) {
      issues.push(issue("OF-305", `app/${route}/route.ts`, `Route /${route} absente.`));
    }
  }
  return issues;
}

/** The site's services behind a rewrite, and what in the sections uses them. */
const SERVICES = [
  {
    source: "/forms/submit",
    serviceId: "cmssubmitform",
    uses: /\b(formFieldsField|OpenFlowForm)\b/,
    what: "les formulaires",
  },
  {
    source: "/cms/booking",
    serviceId: "cmsbooking",
    uses: /\b(bookingServicesField|OpenFlowBooking)\b/,
    what: "la prise de rendez-vous",
  },
];

async function sourcesOf(dir: string): Promise<string> {
  if (!existsSync(dir)) return "";
  const parts: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) parts.push(await sourcesOf(full));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) parts.push(await readFile(full, "utf8"));
  }
  return parts.join("\n");
}

/** OF-306: the rewrites the forms and the appointments of the sections are sent to. */
async function checkServices(siteDir: string, site: HostingConfig | undefined): Promise<Issue[]> {
  if (!site) return [];
  const code = await sourcesOf(path.join(siteDir, "openflow"));
  const issues: Issue[] = [];
  for (const service of SERVICES) {
    if (!service.uses.test(code)) continue;
    const found = site.rewrites?.some(
      (rewrite) =>
        rewrite.source === service.source && rewrite.run?.serviceId === service.serviceId,
    );
    if (!found) {
      issues.push(
        issue(
          "OF-306",
          "firebase.json",
          `Réécriture ${service.source} vers ${service.serviceId} absente : ${service.what} du site ne peuvent rien envoyer.`,
        ),
      );
    }
  }
  return issues;
}

/**
 * Project-level checks (level `fast`): OF-301 (next.config, middleware), OF-303 (Firebase),
 * OF-305 (AI access) and OF-306 (services of the sections).
 */
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
      issues.push(...(await checkAiAccess(siteDir, site)));
      issues.push(...(await checkServices(siteDir, site)));
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
      issues.push(issue("OF-303", file, "Bloc `// BEGIN cms` … `// END cms` absent."));
    } else if (status === "modified") {
      issues.push(
        issue("OF-303", file, "Le bloc de règles OpenFlow a été modifié (sécurité propriétaire)."),
      );
    }
  }
  return issues;
}
