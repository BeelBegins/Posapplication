/**
 * Allow-list sanitiser for HR rich text (FAQ answers, policy content, notice descriptions) before it
 * is placed in innerHTML. It is string based so it runs the same in the WebView and in node tests.
 * Output contains only the allowed tags with no attributes, except <a href> limited to
 * http(s)/mailto links. Everything else is escaped as text or dropped.
 */
const ALLOWED = new Set(["p", "br", "b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "hr", "table", "thead", "tbody", "tr", "th", "td", "span", "div", "a", "sub", "sup", "small"]);
const VOID = new Set(["br", "hr"]);
/** Elements whose whole content is dropped, not just the tags. */
const DROP_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "svg", "math", "textarea", "select", "title", "head"]);

function escapeText(value: string): string {
  // Keep entities the server already encoded; escape every other markup character.
  return value
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeAttr(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
    .replace(/&#(\d+);?/g, (_m, dec) => String.fromCodePoint(Math.min(parseInt(dec, 10), 0x10ffff)))
    .replace(/&colon;/gi, ":").replace(/&tab;/gi, "\t").replace(/&newline;/gi, "\n").replace(/&amp;/gi, "&");
}

export function safeHref(raw: string): string {
  const value = decodeAttr(raw).replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  return /^(https?:\/\/|mailto:)/i.test(value) ? value : "";
}

export function sanitizeRichText(input: unknown): string {
  const html = typeof input === "string" ? input : "";
  if (!html) return "";
  let out = "";
  const open: string[] = [];
  let dropUntil = "";
  // Tags, comments, doctype/CDATA and processing instructions; anything else is text.
  const token = /<!--[\s\S]*?(?:-->|$)|<![\s\S]*?(?:>|$)|<\?[\s\S]*?(?:>|$)|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(html))) {
    const textPart = html.slice(last, match.index);
    if (!dropUntil && textPart) out += escapeText(textPart);
    last = token.lastIndex;
    const name = (match[1] || "").toLowerCase();
    if (!name) continue; // comment / doctype / PI
    const closing = match[0].startsWith("</");
    if (dropUntil) {
      if (closing && name === dropUntil) dropUntil = "";
      continue;
    }
    if (DROP_CONTENT.has(name)) {
      if (!closing && !/\/\s*$/.test(match[2] || "")) dropUntil = name;
      continue;
    }
    if (!ALLOWED.has(name)) continue;
    if (VOID.has(name)) { if (!closing) out += `<${name}>`; continue; }
    if (closing) {
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }
    if (name === "a") {
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(match[2] || "");
      const safe = href ? safeHref(href[1] ?? href[2] ?? href[3] ?? "") : "";
      out += safe ? `<a href="${escapeText(safe).replace(/&(?!amp;|lt;|gt;|quot;)/g, "&amp;")}" target="_blank" rel="noopener noreferrer">` : "<a>";
    } else {
      out += `<${name}>`;
    }
    open.push(name);
    if (open.length > 64) break;
  }
  if (!dropUntil && last < html.length) out += escapeText(html.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  return out;
}
