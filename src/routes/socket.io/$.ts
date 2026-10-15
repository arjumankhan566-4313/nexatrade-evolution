import { createFileRoute } from "@tanstack/react-router";

// Forward socket.io HTTP long-polling to the TRADEON backend.
// (WebSocket upgrade is not possible through this forwarder; socket.io
// falls back to polling, which works over plain HTTP requests.)
// Origin resolution matches the /api forwarder: BACKEND_URL (server /
// production), VITE_API_URL (dev), then a localhost default.
const BACKEND =
  (typeof process !== "undefined" ? process.env?.["BACKEND_URL"] : undefined) ||
  import.meta.env["VITE_API_URL"] ||
  "http://localhost:4000";

// A dead backend must not hang the polling request forever.
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
    console.error(`[socket-proxy] ${request.method} ${url.pathname} → ${target} failed:`, cause);
    return new Response(JSON.stringify({ error: "Upstream socket server unavailable" }), {
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

export const Route = createFileRoute("/socket/io/$")({
  server: {
    handlers: {
      GET: forward,
      POST: forward,
    },
  },
});
