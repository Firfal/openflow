import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  archiveSource,
  create,
  findWorkspaceRoot,
  rewriteForVendor,
  sourceFiles,
  workspaceClosure,
  workspaceDeps,
  workspacePackages,
} from "../src/index.js";

describe("openflow create", () => {
  it("copies the starter and rewrites names, dependencies and project", async () => {
    const dir = path.join(await mkdtemp(path.join(tmpdir(), "openflow-create-")), "boulangerie");
    await create(dir, { name: "Boulangerie Dupont", project: "boulangerie-dupont" });

    for (const file of [
      "openflow.config.tsx",
      "AGENTS.md",
      "CLAUDE.md",
      ".claude/settings.json",
      ".gitignore",
      "firebase.json",
      "firestore.rules",
      "storage.rules",
      "functions/src/index.ts",
      "openflow/seed/pages/accueil.json",
      "app/admin/page.tsx",
    ]) {
      expect(existsSync(path.join(dir, file)), file).toBe(true);
    }
    expect(existsSync(path.join(dir, "gitignore"))).toBe(false);
    expect(existsSync(path.join(dir, "node_modules"))).toBe(false);

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    expect(pkg.name).toBe("boulangerie-dupont");
    expect(JSON.stringify(pkg)).not.toContain("workspace:");
    expect(pkg.dependencies["@openflow/next"]).toMatch(/^\^\d+\.\d+\.\d+$/);
    const functionsPkg = JSON.parse(
      await readFile(path.join(dir, "functions/package.json"), "utf8"),
    );
    expect(JSON.stringify(functionsPkg)).not.toContain("workspace:");

    expect(await readFile(path.join(dir, "openflow.config.tsx"), "utf8")).toContain(
      'name: "Boulangerie Dupont"',
    );
    expect(JSON.parse(await readFile(path.join(dir, ".firebaserc"), "utf8"))).toEqual({
      projects: { default: "boulangerie-dupont" },
    });
    await expect(create(dir, {})).rejects.toThrow(/n'est pas vide/);
  });
});

describe("site package name", () => {
  it("never collides with a dependency of the starter", async () => {
    const dir = path.join(await mkdtemp(path.join(tmpdir(), "openflow-name-")), "site");
    await create(dir, { name: "OpenFlow" });
    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    expect(pkg.name).toBe("openflow-site");
    expect(Object.keys(pkg.devDependencies)).toContain("openflow");
  });
});

describe("source archive", () => {
  it("excludes dependencies, build output, secrets and local state", async () => {
    const dir = path.join(await mkdtemp(path.join(tmpdir(), "openflow-source-")), "site");
    await create(dir, {});
    for (const file of [
      "node_modules/x/index.js",
      "out/index.html",
      ".next/cache",
      "functions/lib/index.js",
      "functions/.env.mon-projet",
      ".openflow/report.md",
      "openflow/.snapshot.json",
    ]) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(path.join(dir, file), "x");
    }
    const files = await sourceFiles(dir);
    expect(files).toContain("package.json");
    expect(files).toContain("openflow/components/Hero.tsx");
    expect(
      files.some((file) =>
        /node_modules|^out\/|\.next|functions\/lib|\.env|\.openflow|\.snapshot/.test(file),
      ),
    ).toBe(false);

    const archive = await archiveSource(dir);
    expect(archive.sha256).toMatch(/^[0-9a-f]{64}$/);
    const listing = execFileSync("tar", ["-tzf", archive.file], { encoding: "utf8" });
    expect(listing).toContain("openflow.config.tsx");
    expect(listing).not.toContain("node_modules");
  });
});

describe("vendoring of unpublished packages (deploy from the monorepo)", () => {
  it("finds the workspace packages a site needs, dependencies included", async () => {
    const root = findWorkspaceRoot(import.meta.dirname);
    expect(root && existsSync(path.join(root, "packages", "core"))).toBe(true);
    const packages = await workspacePackages(root as string);
    expect(packages.get("@openflow/core")).toBe(path.join(root as string, "packages", "core"));
    expect(packages.has("openflow")).toBe(true);
    // The functions only need @openflow/functions, which needs @openflow/core.
    expect(await workspaceClosure(["@openflow/functions"], packages)).toEqual([
      "@openflow/core",
      "@openflow/functions",
    ]);
    await expect(workspaceClosure(["@openflow/inconnu"], packages)).rejects.toThrow(/introuvable/);
  });

  it("points workspace dependencies at the tarballs and overrides nested ones", () => {
    const pkg = {
      name: "site",
      dependencies: { "@openflow/next": "workspace:*", next: "16.3.6" },
      devDependencies: { openflow: "workspace:^" },
    };
    expect(workspaceDeps(pkg)).toEqual(["@openflow/next", "openflow"]);
    const tarballs = new Map([
      ["@openflow/core", "file:vendor/openflow-core-0.1.0.tgz"],
      ["@openflow/next", "file:vendor/openflow-next-0.1.0.tgz"],
      ["openflow", "file:vendor/openflow-0.1.0.tgz"],
    ]);
    const out = rewriteForVendor(pkg, tarballs);
    expect(out.dependencies).toEqual({
      "@openflow/next": "file:vendor/openflow-next-0.1.0.tgz",
      next: "16.3.6",
    });
    expect(out.devDependencies).toEqual({ openflow: "file:vendor/openflow-0.1.0.tgz" });
    // npm accepts an override of a direct dependency only with the exact same spec.
    expect(out.overrides?.["@openflow/next"]).toBe(out.dependencies?.["@openflow/next"]);
    expect(out.overrides?.["@openflow/core"]).toBe("file:vendor/openflow-core-0.1.0.tgz");
    expect(pkg.dependencies["@openflow/next"]).toBe("workspace:*");
    expect(() => rewriteForVendor(pkg, new Map())).toThrow(/Aucune archive/);
  });
});
