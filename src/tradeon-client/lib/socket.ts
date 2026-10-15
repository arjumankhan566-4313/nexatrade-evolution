/**
 * Re-export of the canonical socket client in `src/lib/socket.ts`.
 * (Single shared implementation — both import paths resolve to the same
 * singleton socket and the same `createSocket()` factory.)
 */
export { socket, createSocket } from "../../lib/socket";
