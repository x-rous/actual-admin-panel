/**
 * Formats a raw JSON string with 2-space indentation.
 * Returns the original string unchanged if it is not valid JSON.
 */
export function formatJson(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
}

// ─── Table cell helpers ───────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

/**
 * Formats an ISO 8601 date or datetime string as a locale-aware human-readable
 * date (e.g. "Jan 15, 2024"). Returns null if the value does not match the
 * pattern or cannot be parsed.
 *
 * Date-only strings (YYYY-MM-DD) are parsed at local midnight to avoid UTC
 * off-by-one-day issues.
 */
export function formatIsoDate(v: string): string | null {
  if (!ISO_DATE_RE.test(v)) return null;
  try {
    const d = v.length === 10 ? new Date(`${v}T00:00:00`) : new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

/**
 * Formats an integer amount stored in cents as a locale-aware decimal string.
 * No currency symbol is included — the budget currency is not known to the UI.
 *
 * Examples: 1200 → "12.00",  -45050 → "-450.50",  0 → "0.00"
 */
export function formatCents(v: number): string {
  return (v / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
