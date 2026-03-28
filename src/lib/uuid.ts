/**
 * Generates a UUID v4.
 *
 * `crypto.randomUUID()` is only available in secure contexts (HTTPS or localhost).
 * This utility falls back to a Math.random()-based implementation so the app
 * works on plain HTTP (e.g. LAN / intranet self-hosted deployments).
 *
 * See: https://github.com/x-rous/actual-bench/issues/13
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
