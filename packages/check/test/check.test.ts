import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  analyzeSource,
  checkHtml,
  checkProject,
  formatAgent,
  formatSarif,
  postToolUseHook,
  projectDeclaresHooks,
  RULES,
  runCheck,
  scanSecrets,
  stopHook,
} from "../src/index.js";
import { GOOD_HERO, makeSite, TMP } from "./helpers.js";

const rulesOf = (issues: { rule: string }[]) => issues.map((issue) => issue.rule).sort();

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("registry", () => {
  it("has unique ids and fix hints", () => {
    expect(new Set(RULES.map((rule) => rule.id)).size).toBe(RULES.length);
    for (const rule of RULES) expect(rule.fix.length).toBeGreaterThan(20);
  });
});

describe("static analysis (fast)", () => {
  const section = "openflow/components/Test.tsx";

  it("accepts a compliant section", () => {
    expect(analyzeSource(GOOD_HERO, section)).toEqual([]);
  });

  it("flags hard-coded text, images and links", () => {
    const code = `import photo from "./photo.jpg";
export const Test = { render: ({ title }) => (
  <section style={{ backgroundImage: "url(/bg.jpg)" }}>
    <h2>Nos services</h2>
    <p>{title || "Titre par défaut"}</p>
    <img src={photo.src} alt="Une photo" />
    <img src="/logo.png" alt="" />
    <a href="/contact">{title}</a>
    <a href="#haut">{title}</a>
    <svg><text>Logo</text></svg>
  </section>
) };`;
    expect(rulesOf(analyzeSource(code, section))).toEqual([
      "OF-101",
      "OF-101",
      "OF-101",
      "OF-102",
      "OF-102",
      "OF-102",
      "OF-102",
      "OF-103",
    ]);
  });

  it("only applies editability rules to sections", () => {
    expect(analyzeSource(`export default () => <h1>Admin</h1>;`, "app/admin/page.tsx")).toEqual([]);
  });

  it("flags static-export incompatibilities (OF-301) and Firebase reads (OF-302)", () => {
    const code = `"use server";
import { cookies } from "next/headers";
import { getFirestore } from "firebase/firestore";
export const dynamic = "force-dynamic";
export const revalidate = 60;
export default function Page() { return null; }`;
    expect(rulesOf(analyzeSource(code, "app/(site)/page.tsx"))).toEqual([
      "OF-301",
      "OF-301",
      "OF-301",
      "OF-301",
      "OF-302",
    ]);
    expect(
      analyzeSource(`import { getFirestore } from "firebase/firestore";`, "app/admin/page.tsx"),
    ).toEqual([]);
  });

  it("honours suppression comments", () => {
    const code = `export const X = { render: () => (
  <div>
    {/* openflow-disable-next-line OF-101 */}
    <span>Mentions</span>
    <span>Contact</span>
  </div>
) };`;
    // The comment only covers the next line: "Contact" is still reported.
    const issues = analyzeSource(code, section);
    expect(rulesOf(issues)).toEqual(["OF-101"]);
    expect(issues[0]?.message).toContain("Contact");
    expect(analyzeSource(`/* openflow-disable OF-101 */\n${code}`, section)).toEqual([]);
  });

  it("detects secrets (OF-304)", () => {
    expect(
      rulesOf(
        scanSecrets(`const k = "${["sk", "ant", "api03", "x".repeat(24)].join("-")}";`, "a.ts"),
      ),
    ).toEqual(["OF-304"]);
    expect(scanSecrets(`const apiKey = "AIzaSyD-public-web-key";`, "a.ts")).toEqual([]);
  });
});

describe("project checks", () => {
  it("passes on a compliant site", async () => {
    const dir = await makeSite("project-ok");
    expect(await checkProject(dir)).toEqual([]);
  });

  it("detects weakened rules and missing static export", async () => {
    const dir = await makeSite("project-bad", {
      "firestore.rules":
        "rules_version = '2';\n// BEGIN openflow\nallow read, write: if true;\n// END openflow\n",
      "storage.rules": null,
      "next.config.ts": "export default {};",
      "middleware.ts": "export function middleware() {}",
      "firebase.json": { hosting: { public: "out" } },
    });
    const rules = rulesOf(await checkProject(dir));
    expect(rules.filter((rule) => rule === "OF-301")).toHaveLength(3);
    expect(rules.filter((rule) => rule === "OF-303").length).toBeGreaterThanOrEqual(4);
  });
});

describe("render checks (sentinels)", () => {
  it("reports a compliant site at 100 % editability", async () => {
    const dir = await makeSite("render-ok");
    const result = await runCheck({ siteDir: dir, level: "render" });
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.sections).toEqual([
      expect.objectContaining({ name: "Hero", fields: 6, renderedFields: 6 }),
    ]);
  }, 30_000);

  it("detects dead fields, hidden hard-coded text, crashes and attribute misuse", async () => {
    const bad = `import { imageField } from "@openflow/core";
const LABEL = "Découvrir la carte";
export const Promo = {
  fields: {
    title: { type: "text", contentEditable: true },
    subtitle: { type: "text" },
    code: { type: "text", metadata: { openflowInline: false } },
    note: { type: "text" },
    image: imageField(),
    unused: { type: "textarea" },
  },
  defaultProps: { title: "Promo", subtitle: "Sous-titre", code: "npx x", image: null, unused: "x" },
  render: ({ title, subtitle, code, image }) => (
    <section>
      <h2>{subtitle}</h2>
      <code>{code}</code>
      <img src={image.src} alt={title} />
      <span>{LABEL}</span>
    </section>
  ),
};
`;
    const dir = await makeSite("render-bad", {
      "openflow/components/Promo.tsx": bad,
      "openflow.config.tsx": `import { defineConfig } from "@openflow/core";
import { Promo } from "./openflow/components/Promo";
export default defineConfig({ site: { name: "X" }, components: { Promo } });`,
      "openflow/seed/pages/accueil.json": {
        slug: "",
        title: "Accueil",
        data: {
          root: { props: {} },
          content: [
            { type: "Promo", props: { title: 1 } },
            { type: "Nope", props: {} },
          ],
        },
      },
    });
    const result = await runCheck({ siteDir: dir, level: "render" });
    const rules = rulesOf(result.issues);
    expect(rules).toContain("OF-101"); // LABEL constant rendered as text
    expect(rules).toContain("OF-104"); // `note` and `unused` never rendered
    expect(rules).toContain("OF-105"); // `note` has no default
    expect(rules).toContain("OF-106"); // `subtitle` rendered as text but not contentEditable
    // `code` opts out explicitly (metadata.openflowInline = false): no OF-106 for it.
    expect(
      result.issues.some((issue) => issue.rule === "OF-106" && issue.message.includes("« code »")),
    ).toBe(false);
    expect(rules).toContain("OF-107"); // image.src crashes when image is null
    expect(rules).toContain("OF-108"); // contentEditable `title` used in alt
    expect(rules).toContain("OF-201"); // invalid seed
    const hardCoded = result.issues.find((issue) => issue.rule === "OF-101");
    expect(hardCoded?.file).toBe("openflow/components/Promo.tsx");
    expect(hardCoded?.line).toBe(2);
  }, 30_000);

  it("reports a config that cannot be loaded", async () => {
    const dir = await makeSite("render-broken", {
      "openflow.config.tsx": `import "./does-not-exist";\nexport default {};`,
    });
    const result = await runCheck({ siteDir: dir, level: "render" });
    expect(rulesOf(result.issues)).toContain("OF-107");
  }, 30_000);
});

describe("html checks (build)", () => {
  it("checks lang, title, headings, alt and internal links", async () => {
    const dir = await makeSite("html");
    const out = path.join(dir, "out");
    await mkdir(path.join(out, "a-propos"), { recursive: true });
    await mkdir(path.join(out, "admin"), { recursive: true });
    await writeFile(
      path.join(out, "index.html"),
      `<!doctype html><html lang="fr"><head><title>Accueil</title><meta name="description" content="x"></head>
<body><h1>A</h1><h2>B</h2><img src="/a.jpg" alt=""><a href="/a-propos/">ok</a></body></html>`,
    );
    await writeFile(
      path.join(out, "a-propos/index.html"),
      `<!doctype html><html><head></head><body><h1>A</h1><h1>B</h1><h4>C</h4><img src="/b.jpg"><a href="/nulle-part/">x</a><a href="/admin/">admin</a></body></html>`,
    );
    await writeFile(path.join(out, "admin/index.html"), "<html><body>admin</body></html>");
    const rules = rulesOf(await checkHtml(dir));
    expect(rules).toEqual(["OF-401", "OF-402", "OF-402", "OF-403", "OF-403", "OF-404", "OF-405"]);
  });
});

describe("formatters", () => {
  it("prints each fix hint once and produces valid SARIF", () => {
    const issues = [
      {
        rule: "OF-101",
        severity: "error" as const,
        message: "a",
        file: "x.tsx",
        line: 1,
        hint: "fix",
      },
      {
        rule: "OF-101",
        severity: "error" as const,
        message: "b",
        file: "x.tsx",
        line: 2,
        hint: "fix",
      },
    ];
    const text = formatAgent(issues);
    expect(text.match(/→ fix/g)).toHaveLength(1);
    expect(text).toContain("x.tsx:2");
    const sarif = JSON.parse(formatSarif(issues, "0.1.0"));
    expect(sarif.runs[0].results).toHaveLength(2);
  });
});

describe("Claude Code hooks", () => {
  it("detects hooks already declared by the project (plugin stays silent)", async () => {
    const dir = await makeSite("hook-dedupe", {
      ".claude/settings.json": {
        hooks: {
          PostToolUse: [
            {
              matcher: "Write",
              hooks: [
                {
                  type: "command",
                  command: '"$CLAUDE_PROJECT_DIR/node_modules/.bin/openflow" hook post-tool-use',
                },
              ],
            },
          ],
        },
      },
    });
    expect(await projectDeclaresHooks(dir)).toBe(true);
    expect(await projectDeclaresHooks(path.join(dir, "openflow"))).toBe(false);
    expect(await projectDeclaresHooks(undefined)).toBe(false);
  });

  it("PostToolUse exits 2 with actionable feedback on errors", async () => {
    const dir = await makeSite("hook-post", {
      "openflow/components/Bad.tsx": `export const Bad = { render: () => <h2>Titre figé</h2> };`,
    });
    const bad = await postToolUseHook({
      cwd: dir,
      tool_name: "Write",
      tool_input: { file_path: "openflow/components/Bad.tsx" },
    });
    expect(bad.exitCode).toBe(2);
    expect(bad.stderr).toContain("OF-101");
    expect(bad.stderr).toContain("openflow/components/Bad.tsx:1");
    const good = await postToolUseHook({
      cwd: dir,
      tool_name: "Edit",
      tool_input: { file_path: path.join(dir, "openflow/components/Hero.tsx") },
    });
    expect(good.exitCode).toBe(0);
    const outside = await postToolUseHook({
      cwd: TMP,
      tool_input: { file_path: "/tmp/other.tsx" },
    });
    expect(outside.exitCode).toBe(0);
  }, 30_000);

  it("Stop blocks up to 3 times, then lets Claude stop with a summary", async () => {
    const dir = await makeSite("hook-stop", {
      "openflow/components/Hero.tsx": GOOD_HERO.replace(
        "<h1>{title}</h1>",
        "<h1>{title}</h1><p>Texte figé</p>",
      ),
    });
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await stopHook({ cwd: dir, session_id: "s1" });
      const payload = JSON.parse(result.stdout!);
      expect(payload.decision).toBe("block");
      expect(payload.reason).toContain(`tentative ${attempt}/3`);
    }
    const released = JSON.parse((await stopHook({ cwd: dir, session_id: "s1" })).stdout!);
    expect(released.decision).toBeUndefined();
    expect(released.systemMessage).toContain("erreur");
    const other = JSON.parse((await stopHook({ cwd: dir, session_id: "s2" })).stdout!);
    expect(other.decision).toBe("block");

    const ok = await makeSite("stop-ok/site");
    expect(
      (await stopHook({ cwd: path.dirname(ok), session_id: "s3" })).stdout ?? "",
    ).not.toContain("block");
  }, 60_000);
});
