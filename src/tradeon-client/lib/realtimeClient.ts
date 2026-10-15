// @ts-nocheck
/**
 * Re-export the legacy realtimeClient surface from the V2 legacyInfra shim.
 * The real SSE/socket transport is ported in a later phase; useLiveEvents is
 * currently a no-op so ported pages compile and run without crashing.
 */
export { useLiveEvents, deviceFingerprint } from "./legacyInfra";
