/**
 * Re-export the legacy realtimeClient surface from the V2 legacyInfra shim.
 * `useLiveEvents` is fully wired to the V2 Socket.io server (cookie auth,
 * `join:rt` / `leave:rt` rooms, `rt:<channel>` events) and returns the legacy
 * `{ status: 'connecting' | 'live' | 'reconnecting' }` contract.
 */
export { useLiveEvents, deviceFingerprint } from "./legacyInfra";
