import { parse } from "@babel/parser";
import type { Issue } from "@openflow/core";
import { getRule } from "./rules.js";

/** Minimal Babel AST node shape (we avoid depending on @babel/types). */
interface Node {
  type: string;
  loc?: { start: { line: number; column: number } };
  [key: string]: any;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(\?.*)?$/i;
const HAS_WORD = /\p{L}{2,}/u;
const FIREBASE_READ_IMPORT =
  /^(firebase\/(firestore|database)(\/.*)?|firebase-admin(\/.*)?|@firebase\/(firestore|database))$/;

/** Where a file sits in an OpenFlow site, which decides the rules that apply to it. */
export interface FileScope {
  /** Sections and layout components: editability rules OF-101/102/103. */
  editable: boolean;
  /** Publicly rendered code: OF-302 applies. */
  publicRender: boolean;
  /** Next.js application code: OF-301 applies. */
  next: boolean;
}

export function scopeFor(relPath: string): FileScope {
  const p = relPath.replaceAll("\\", "/");
  const inOpenflow = p.startsWith("openflow/") && !p.startsWith("openflow/seed/");
  const editable =
    inOpenflow && /^(openflow\/(components|layout|sections)\/)/.test(p) && /\.[jt]sx?$/.test(p);
  const inApp = p.startsWith("app/") || p.startsWith("src/app/");
  const inAdmin = /^(src\/)?app\/admin\//.test(p);
  return {
    editable,
    publicRender: (inApp && !inAdmin) || inOpenflow,
    next:
      inApp ||
      inOpenflow ||
      p.startsWith("src/") ||
      p.startsWith("components/") ||
      p.startsWith("lib/"),
  };
}

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

function issue(ruleId: string, file: string, node: Node | undefined, message: string): Issue {
  const rule = getRule(ruleId);
  return {
    rule: rule.id,
    severity: rule.severity,
    message,
    file,
    line: node?.loc?.start.line,
    column: node?.loc ? node.loc.start.column + 1 : undefined,
    hint: rule.fix,
  };
}

function jsxName(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXMemberExpression")
    return `${jsxName(node.object)}.${jsxName(node.property)}`;
  return undefined;
}

function staticString(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis.map((q: Node) => q.value.cooked ?? "").join("");
  }
  if (node.type === "JSXExpressionContainer") return staticString(node.expression);
  return undefined;
}

function rootIdentifier(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") return rootIdentifier(node.object);
  if (node.type === "JSXExpressionContainer") return rootIdentifier(node.expression);
  return undefined;
}

interface Suppressions {
  file: Set<string>;
  lines: Map<number, Set<string>>;
}

function readSuppressions(comments: Node[]): Suppressions {
  const result: Suppressions = { file: new Set(), lines: new Map() };
  for (const comment of comments) {
    const text: string = comment.value;
    const nextLine = text.match(/openflow-disable-next-line\s+([A-Z0-9,\s-]+)/);
    if (nextLine) {
      const line = (comment.loc?.start.line ?? 0) + 1;
      const set = result.lines.get(line) ?? new Set();
      for (const id of nextLine[1]!.match(/OF-\d{3}/g) ?? []) set.add(id);
      result.lines.set(line, set);
      continue;
    }
    const whole = text.match(/openflow-disable\s+([A-Z0-9,\s-]+)/);
    if (whole) for (const id of whole[1]!.match(/OF-\d{3}/g) ?? []) result.file.add(id);
  }
  return result;
}

/** Walks every child node, calling `visit` with the ancestor chain. */
function walk(node: Node, visit: (node: Node, ancestors: Node[]) => void, ancestors: Node[] = []) {
  visit(node, ancestors);
  const nextAncestors = [...ancestors, node];
  for (const key of Object.keys(node)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "extra" ||
      key.endsWith("Comments")
    ) {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === "string") walk(child, visit, nextAncestors);
      }
    } else if (value && typeof value.type === "string") {
      walk(value, visit, nextAncestors);
    }
  }
}

function insideSvg(ancestors: Node[]): boolean {
  return ancestors.some(
    (node) => node.type === "JSXElement" && jsxName(node.openingElement?.name) === "svg",
  );
}

/** Returns true when `node` is rendered as a JSX child (not an attribute value). */
function isJsxChild(ancestors: Node[]): boolean {
  const parent = ancestors[ancestors.length - 1];
  return parent?.type === "JSXElement" || parent?.type === "JSXFragment";
}

/** Collects hard-coded strings that end up rendered inside a JSX child expression. */
function renderedStrings(expression: Node): Node[] {
  switch (expression.type) {
    case "StringLiteral":
    case "TemplateLiteral":
      return staticString(expression) !== undefined || expression.type === "TemplateLiteral"
        ? [expression]
        : [];
    case "LogicalExpression":
      return expression.operator === "&&"
        ? renderedStrings(expression.right)
        : [...renderedStrings(expression.left), ...renderedStrings(expression.right)];
    case "ConditionalExpression":
      return [...renderedStrings(expression.consequent), ...renderedStrings(expression.alternate)];
    default:
      return [];
  }
}

function literalText(node: Node): string {
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral")
    return node.quasis.map((q: Node) => q.value.cooked ?? "").join(" ");
  return "";
}

/**
 * Static analysis of one source file (level `fast`): OF-101, OF-102, OF-103, OF-301, OF-302.
 * `relPath` is relative to the site root and decides which rules apply.
 */
export function analyzeSource(code: string, relPath: string): Issue[] {
  const scope = scopeFor(relPath);
  if (!scope.editable && !scope.publicRender && !scope.next) return [];
  let ast: Node;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    }) as unknown as Node;
  } catch {
    return []; // Syntax errors are reported by TypeScript / Next.js.
  }
  const issues: Issue[] = [];
  const imageImports = new Set<string>();

  const program: Node = ast.program;
  for (const directive of program.directives ?? []) {
    if (scope.next && directive.value?.value === "use server") {
      issues.push(
        issue(
          "OF-301",
          relPath,
          directive,
          "Directive « use server » (Server Actions) : aucun serveur Next.js en production.",
        ),
      );
    }
  }

  walk(program, (node, ancestors) => {
    switch (node.type) {
      case "ImportDeclaration": {
        const source: string = node.source.value;
        if (scope.editable && IMAGE_EXT.test(source)) {
          issues.push(
            issue("OF-102", relPath, node, `Image importée depuis le code (« ${source} »).`),
          );
          for (const specifier of node.specifiers ?? []) imageImports.add(specifier.local.name);
        }
        if (scope.next && source === "next/headers") {
          issues.push(
            issue(
              "OF-301",
              relPath,
              node,
              "Import de « next/headers » (cookies(), headers()) : indisponible en export statique.",
            ),
          );
        }
        if (scope.publicRender && FIREBASE_READ_IMPORT.test(source)) {
          issues.push(
            issue(
              "OF-302",
              relPath,
              node,
              `Import de « ${source} » dans du code rendu publiquement.`,
            ),
          );
        }
        break;
      }
      case "ExportNamedDeclaration": {
        if (!scope.next || node.declaration?.type !== "VariableDeclaration") break;
        for (const declarator of node.declaration.declarations) {
          const name = declarator.id?.name;
          const init = declarator.init;
          if (name === "dynamic" && init?.value === "force-dynamic") {
            issues.push(
              issue(
                "OF-301",
                relPath,
                declarator,
                '`dynamic = "force-dynamic"` : rendu serveur impossible en export statique.',
              ),
            );
          }
          if (name === "revalidate" && init?.type === "NumericLiteral" && init.value > 0) {
            issues.push(
              issue(
                "OF-301",
                relPath,
                declarator,
                "`revalidate` (ISR) : impossible en export statique, le site est reconstruit à chaque publication.",
              ),
            );
          }
          if (name === "dynamicParams" && init?.type === "BooleanLiteral" && init.value) {
            issues.push(
              issue(
                "OF-301",
                relPath,
                declarator,
                "`dynamicParams = true` : toutes les pages doivent être générées au build.",
              ),
            );
          }
        }
        break;
      }
      case "BlockStatement": {
        for (const directive of node.directives ?? []) {
          if (scope.next && directive.value?.value === "use server") {
            issues.push(
              issue(
                "OF-301",
                relPath,
                directive,
                "Server Action (« use server ») : aucun serveur Next.js en production.",
              ),
            );
          }
        }
        break;
      }
      case "JSXText": {
        if (!scope.editable || insideSvg(ancestors)) break;
        if (HAS_WORD.test(node.value)) {
          issues.push(issue("OF-101", relPath, node, `Texte en dur « ${snippet(node.value)} ».`));
        }
        break;
      }
      case "JSXExpressionContainer": {
        if (!scope.editable || !isJsxChild(ancestors) || insideSvg(ancestors)) break;
        for (const literal of renderedStrings(node.expression)) {
          const text = literalText(literal);
          if (HAS_WORD.test(text)) {
            issues.push(
              issue(
                "OF-101",
                relPath,
                literal,
                `Texte en dur « ${snippet(text)} » (y compris une valeur de secours).`,
              ),
            );
          }
        }
        break;
      }
      case "JSXAttribute": {
        if (!scope.editable) break;
        const name = node.name?.name;
        const value = staticString(node.value ?? undefined);
        if (name === "alt" && value && HAS_WORD.test(value) && !insideSvg(ancestors)) {
          issues.push(
            issue("OF-101", relPath, node, `Texte alternatif en dur alt="${snippet(value)}".`),
          );
        }
        if ((name === "src" || name === "srcSet" || name === "poster") && !insideSvg(ancestors)) {
          if (value) {
            issues.push(
              issue(
                "OF-102",
                relPath,
                node,
                `Source d'image ou de média en dur ${name}="${snippet(value)}".`,
              ),
            );
          } else if (imageImports.has(rootIdentifier(node.value) ?? "")) {
            issues.push(issue("OF-102", relPath, node, `Image importée utilisée dans ${name}.`));
          }
        }
        // `#anchors` and the home page `/` are structural and always valid.
        if (
          name === "href" &&
          value !== undefined &&
          value !== "" &&
          value !== "/" &&
          !value.startsWith("#")
        ) {
          issues.push(issue("OF-103", relPath, node, `Lien en dur href="${snippet(value)}".`));
        }
        if (name === "style" && node.value?.type === "JSXExpressionContainer") {
          const style = node.value.expression;
          if (style?.type === "ObjectExpression") {
            for (const prop of style.properties) {
              const text = staticString(prop.value);
              if (text && /url\(/i.test(text)) {
                issues.push(
                  issue("OF-102", relPath, prop, "Image de fond en dur dans `style` (url(...))."),
                );
              }
            }
          }
        }
        break;
      }
      default:
        break;
    }
  });

  const suppressions = readSuppressions((ast as Node).comments ?? []);
  return issues.filter(
    (entry) =>
      !suppressions.file.has(entry.rule) &&
      !(entry.line && suppressions.lines.get(entry.line)?.has(entry.rule)),
  );
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, "clé privée"],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "clé d'API Anthropic"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "jeton GitHub"],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}\b/, "jeton GitHub"],
  [/\bAKIA[0-9A-Z]{16}\b/, "clé AWS"],
  [/\bsk_live_[0-9a-zA-Z]{20,}\b/, "clé Stripe"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, "jeton Slack"],
];

/** OF-304: high-confidence secret patterns in any text file. */
export function scanSecrets(text: string, relPath: string): Issue[] {
  const issues: Issue[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        const rule = getRule("OF-304");
        issues.push({
          rule: rule.id,
          severity: rule.severity,
          message: `Secret détecté (${label}).`,
          file: relPath,
          line: index + 1,
          hint: rule.fix,
        });
      }
    }
  });
  return issues;
}
