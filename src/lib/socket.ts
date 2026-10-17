/**
 * Canonical socket.io client for the app.
 *
 * Same-origin by default: the forwarder in `src/routes/socket[.]io.ts` proxies
 * /socket.io to the API. VITE_API_URL overrides this when the API is deployed
 * on a separate origin.
 *
 * `src/tradeon-client/lib/socket.ts` re-exports this module — import either
 * path, they are the same singleton.
 */
import { io } from "socket.io-client";
export const socket = io(import.meta.env["VITE_API_URL"] ?? "/", {
  path: "/socket.io",
  addTrailingSlash: false,
  transports: import.meta.env["VITE_API_URL"] ? ["websocket", "polling"] : ["polling"],
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
    addTrailingSlash: false,
    transports: import.meta.env["VITE_API_URL"] ? ["websocket", "polling"] : ["polling"],
    autoConnect: true,
  });
}
