/**
 * Base typed API client for the jhonderson/actual-http-api wrapper.
 *
 * All requests are routed through the Next.js proxy at /api/proxy so that
 * the browser never makes a cross-origin fetch (no CORS issues). The proxy
 * forwards to: {baseUrl}/v1/budgets/{budgetSyncId}/{resource}
 */

import type { ConnectionInstance } from "@/store/connection";
import type { ApiError } from "@/types/errors";

// ─── Request helpers ──────────────────────────────────────────────────────────

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

/**
 * Core fetch wrapper. Routes through /api/proxy (server-side) so that
 * CORS is never an issue regardless of where actual-http-api is hosted.
 * Throws a structured ApiError on non-2xx responses.
 */
export async function apiRequest<T>(
  connection: ConnectionInstance,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body } = options;

  let response: Response;

  try {
    response = await fetch("/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connection, path, method, body }),
    });
  } catch (err) {
    // Network-level failure (e.g. server not running)
    const error: ApiError = {
      kind: "api",
      status: 0,
      message:
        err instanceof Error ? err.message : "Network error — is the dev server running?",
    };
    throw error;
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const json = (await response.json()) as { error?: string; message?: string };
      message = json.error ?? json.message ?? message;
    } catch {
      // ignore parse errors
    }

    const error: ApiError = {
      kind: "api",
      status: response.status,
      message,
    };
    throw error;
  }

  return response.json() as Promise<T>;
}

/**
 * Test connectivity by fetching the accounts list through the proxy.
 * Resolves on success, throws ApiError on failure.
 */
export async function testConnection(
  connection: ConnectionInstance
): Promise<void> {
  await apiRequest<unknown>(connection, "/accounts", { method: "GET" });
}
