import { createFileRoute } from "@tanstack/react-router";

// Forward every /api/* request to the TRADEON backend. The origin is resolved
// from (in order): BACKEND_URL (server / production), VITE_API_URL (dev),
// then a localhost default for local development.
const BACKEND =
  (typeof process !== "undefined" ? process.env?.["BACKEND_URL"] : undefined) ||
  import.meta.env["VITE_API_URL"] ||
  "http://localhost:4000";

// Never let a dead backend hang an SSR request (or a browser fetch) forever.
const FORWARD_TIMEOUT_MS = 15_000;

async function forward({ request }: { request: Request }) {
  const url = new URL(request.url);
  const target = BACKEND + url.pathname + url.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  let res: Response;
  try {
    res = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
  } catch (cause) {
    // Backend unreachable or too slow — fail fast with a clear 502 instead of
    // hanging the SSR render / the caller's fetch.
    console.error(`[api-proxy] ${request.method} ${url.pathname} → ${target} failed:`, cause);
    return new Response(JSON.stringify({ error: "Upstream API unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const resHeaders = new Headers(res.headers);
  resHeaders.delete("transfer-encoding");
  resHeaders.delete("content-encoding");
  resHeaders.delete("connection");

  return new Response(res.body, { status: res.status, headers: resHeaders });
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: forward,
      POST: forward,
      PUT: forward,
      PATCH: forward,
      DELETE: forward,
      OPTIONS: forward,
    },
  },
});
