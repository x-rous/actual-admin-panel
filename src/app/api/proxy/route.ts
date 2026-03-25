/**
 * Server-side proxy for the jhonderson/actual-http-api.
 *
 * All browser → actual-http-api calls go through here so that:
 *  - CORS is never an issue (fetch runs on the server)
 *  - Credentials are never exposed in browser network logs beyond this app
 *
 * POST /api/proxy
 * Body: { connection: ConnectionInstance, path: string, method?: string, body?: unknown }
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ConnectionInstance } from "@/store/connection";

type ProxyRequestBody = {
  connection: ConnectionInstance;
  path: string;
  method?: string;
  body?: unknown;
};

export async function POST(request: NextRequest) {
  let payload: ProxyRequestBody;

  try {
    payload = (await request.json()) as ProxyRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { connection, path, method = "GET", body } = payload;

  if (!connection?.baseUrl || !connection?.apiKey || !connection?.budgetSyncId) {
    return NextResponse.json({ error: "Missing connection details" }, { status: 400 });
  }

  const url = `${connection.baseUrl.replace(/\/$/, "")}/v1/budgets/${connection.budgetSyncId}${path}`;

  const headers: Record<string, string> = {
    "x-api-key": connection.apiKey,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };

  // Always send the header — some deployments require it to be present
  // even for unencrypted budgets. Defaults to empty string when not set.
  headers["budget-encryption-password"] = connection.encryptionPassword ?? "";

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Network error reaching API server";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // 204 No Content — return empty response with same status
  if (upstreamResponse.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  // For error responses, try to extract a message from the upstream body
  if (!upstreamResponse.ok) {
    let message = `HTTP ${upstreamResponse.status}`;
    try {
      const json = (await upstreamResponse.json()) as {
        message?: string;
        error?: string;
      };
      message = json.message ?? json.error ?? message;
    } catch {
      // ignore — use status string
    }
    return NextResponse.json(
      { error: message },
      { status: upstreamResponse.status }
    );
  }

  const data: unknown = await upstreamResponse.json();
  return NextResponse.json(data);
}
