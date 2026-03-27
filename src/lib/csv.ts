/**
 * Shared CSV utilities used across all feature import/export pipelines.
 * Single source of truth — do not duplicate these in feature components.
 */

/**
 * Parse a single CSV line respecting RFC 4180 double-quoted fields.
 * Handles escaped quotes ("") within quoted fields.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current); current = ""; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Wrap a CSV field value in double-quotes if it contains commas, quotes, or newlines.
 * Returns an empty string for null/undefined values.
 */
export function csvField(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/**
 * Parse a boolean-ish string ("true", "1", "yes" → true; everything else → false).
 */
export function parseBoolean(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Maximum file size accepted by all CSV import handlers (5 MB). */
export const CSV_MAX_BYTES = 5 * 1024 * 1024;
