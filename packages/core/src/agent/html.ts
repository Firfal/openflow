import { isSafeHref } from "../fields.js";

/** Tags kept in rich text written by an AI (the rich text editor produces the same set). */
const ALLOWED = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "code",
]);

/** Elements removed with their content. */
const DROPPED = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "template",
  "noscript",
  "svg",
  "math",
  "textarea",
  "select",
  "title",
]);

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|<|>/g;

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function attribute(attrs: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(
    attrs,
  );
  const raw = match ? (match[1] ?? match[2] ?? match[3]) : undefined;
  return raw
    ?.replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Keeps a safe subset of HTML in a rich text value: known formatting tags, links with safe
 * targets, no attributes other than `href`, no scripts, styles or event handlers.
 */
export function sanitizeRichText(html: string): string {
  let out = "";
  let last = 0;
  let dropping: string | undefined;
  for (const match of html.matchAll(TOKEN)) {
    const text = html.slice(last, match.index);
    last = match.index + match[0].length;
    if (!dropping) out += text;
    const [token, closing, rawName, attrs = ""] = match;
    const name = rawName?.toLowerCase();
    if (dropping) {
      if (closing && name === dropping) dropping = undefined;
      continue;
    }
    if (!name) {
      // A comment, or a stray `<` / `>`: comments go, brackets are escaped.
      if (token === "<") out += "&lt;";
      else if (token === ">") out += "&gt;";
      continue;
    }
    if (DROPPED.has(name)) {
      if (!closing && !attrs.trim().endsWith("/")) dropping = name;
      continue;
    }
    if (!ALLOWED.has(name)) continue;
    if (closing) {
      if (name !== "br") out += `</${name}>`;
      continue;
    }
    if (name === "a") {
      const href = attribute(attrs, "href");
      const safe = href && isSafeHref(href) ? ` href="${escapeAttribute(href.trim())}"` : "";
      const external = safe && /^https?:/i.test(href?.trim() ?? "");
      out += `<a${safe}${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>`;
      continue;
    }
    out += name === "br" ? "<br>" : `<${name}>`;
  }
  if (!dropping) out += html.slice(last);
  return out;
}
