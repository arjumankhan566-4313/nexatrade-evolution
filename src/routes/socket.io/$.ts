import { createFileRoute } from "@tanstack/react-router";

// Forward socket.io HTTP long-polling to the TRADEON backend on :4000.
// (WebSocket upgrade is not possible through this forwarder; socket.io
// falls back to polling, which works over plain HTTP requests.)
const BACKEND = "http://localhost:4000";

async function forward({ request }: { request: Request }) {
  const url = new URL(request.url);
  const target = BACKEND + url.pathname + url.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const res = await fetch(target, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  const resHeaders = new Headers(res.headers);
  resHeaders.delete("transfer-encoding");
  resHeaders.delete("content-encoding");
  resHeaders.delete("connection");

  return new Response(res.body, { status: res.status, headers: resHeaders });
}

export const Route = createFileRoute("/socket.io/$")({
  server: {
    handlers: {
      GET: forward,
      POST: forward,
    },
  },
});
