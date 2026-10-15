import { io } from "socket.io-client";

// Same-origin by default: the Vite dev server proxies /socket.io to the API.
// VITE_API_URL overrides this when the API is deployed on a separate origin.
export const socket = io(import.meta.env["VITE_API_URL"] ?? "/", {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  autoConnect: true,
});

/**
 * An additional connection for surfaces that need their OWN subscription set.
 * The gateway keeps one symbol set + one timeframe per socket, so pages with
 * several independent charts (/dashboard/multi) cannot share the app-wide
 * socket without the cells overwriting each other. The caller owns the
 * lifecycle and must `disconnect()` it.
 */
export function createSocket() {
  return io(import.meta.env["VITE_API_URL"] ?? "/", {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
}
