/**
 * Lightweight JSON syntax colorizer.
 *
 * Accepts a single line of pretty-printed JSON and returns an HTML string
 * with <span> wrappers that apply CSS custom property colors per token type.
 *
 * Used by:
 *   - RawView in QueryResults (results raw view)
 *   - JsonEditor overlay in Batch 3 (editor syntax coloring)
 *
 * Token colors are driven by CSS custom properties defined in globals.css
 * (--json-key, --json-string, --json-number, --json-boolean, --json-null,
 * --json-punct) so they respond to the dark-mode variant automatically.
 *
 * XSS safety: all token content is HTML-escaped before being placed inside
 * <span> tags. The HTML is only used via dangerouslySetInnerHTML in controlled
 * display components, never in user-facing input fields.
 */

// Matches JSON tokens in order of specificity.
// Group 1: string token
// Group 2: optional whitespace + colon following a string (marks it as a key)
// Group 3: boolean / null literal
// Group 4: number
// Group 5: punctuation character
// Group 6: whitespace (passed through uncolored)
const TOKEN_RE =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^"\\])*")(\s*:)?|(true|false|null)|(-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)|([{}[\],:])|(\s+)/g;

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function span(cssVar: string, content: string): string {
  return `<span style="color:var(--${cssVar})">${escapeHtml(content)}</span>`;
}

export function colorizeJson(line: string): string {
  let result = "";
  let lastIndex = 0;

  TOKEN_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(line)) !== null) {
    // Pass through any gap between matches as escaped plain text
    if (match.index > lastIndex) {
      result += escapeHtml(line.slice(lastIndex, match.index));
    }
    lastIndex = TOKEN_RE.lastIndex;

    const [, strToken, colonSuffix, literal, number, punct, whitespace] = match;

    if (strToken !== undefined) {
      if (colonSuffix !== undefined) {
        // Object key — strToken is "key", colonSuffix may be " :" or ":"
        result += span("json-key", strToken);
        // Preserve any whitespace between the string and the colon
        const ws = colonSuffix.slice(0, colonSuffix.indexOf(":"));
        if (ws) result += escapeHtml(ws);
        result += span("json-punct", ":");
      } else {
        result += span("json-string", strToken);
      }
    } else if (literal !== undefined) {
      result += span(literal === "null" ? "json-null" : "json-boolean", literal);
    } else if (number !== undefined) {
      result += span("json-number", number);
    } else if (punct !== undefined) {
      result += span("json-punct", punct);
    } else if (whitespace !== undefined) {
      result += escapeHtml(whitespace);
    }
  }

  // Any remaining unmatched text
  if (lastIndex < line.length) {
    result += escapeHtml(line.slice(lastIndex));
  }

  return result;
}
