import { createFileRoute } from "@tanstack/react-router";

// Forward every /api/* request to the TRADEON backend running on :4000.
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
