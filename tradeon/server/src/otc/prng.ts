/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE OTC — DETERMINISTIC COUNTER-BASED PRNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported 1:1 from legacy src/lib/otc/prng.js — identical SplitMix64/Weyl
 * arithmetic (BigInt, so results match on every JS engine), identical stream
 * layout, identical FNV-1a seed derivation. The OTC price engine is
 * STATELESS-FORWARD: every value is a pure function of (seed, sequence,
 * stream), never of process memory.
 *
 * THIS MODULE HAS NO KNOWLEDGE OF USERS, TRADES, STAKES, DIRECTIONS OR
 * EXPOSURE — it is a pure number generator.
 */

const MASK64 = (1n << 64n) - 1n;
const TWO_POW_53 = 9007199254740992; // 2 ** 53 — exact in a double

export type SeedReference = string | bigint | number;

/** Parse a 16-hex-char (or numeric) seed reference into a BigInt lane. */
function seedToBigInt(seed: SeedReference): bigint {
  if (typeof seed === 'bigint') return seed & MASK64;
  if (typeof seed === 'number' && Number.isFinite(seed)) return BigInt(Math.trunc(seed)) & MASK64;
  const hex = String(seed || '0').trim();
  try {
    return BigInt(hex.startsWith('0x') ? hex : `0x${hex}`) & MASK64;
  } catch {
    return 0n;
  }
}

/** SplitMix64 mixing step — counter in, 64-bit unsigned counter out. */
function splitmix64(seed: bigint, counter: bigint): bigint {
  let z = (seed + counter * 0x9e3779b97f4a7c15n) & MASK64;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  return (z ^ (z >> 31n)) & MASK64;
}

/**
 * Uniform float in [0, 1). `stream` lets one sequence number drive several
 * independent draws (price shock, regime roll, spread jitter) without them
 * correlating.
 */
export function uniform(seed: SeedReference, counter: number, stream = 0): number {
  const mixed = splitmix64(seedToBigInt(seed), BigInt(counter) * 4n + BigInt(stream));
  // Take the top 53 bits → an exact double in [0, 1).
  return Number(mixed >> 11n) / TWO_POW_53;
}

/** Standard normal draw (Box–Muller, deterministic given seed/counter/stream). */
export function gaussian(seed: SeedReference, counter: number, stream = 0): number {
  const u1 = Math.max(1e-12, uniform(seed, counter, stream)); // avoid log(0)
  const u2 = uniform(seed, counter, stream + 1);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Derive a stable per-instrument seed reference from the process secret. The
 * secret never leaves the server; only this hex reference is persisted.
 */
export function deriveSeedReference(secret: string, symbol: string): string {
  const input = `${secret || 'nexatrade-otc'}|${String(symbol || '').toUpperCase()}`;
  let h = 0xcbf29ce484222325n; // FNV-1a 64 offset basis
  for (let i = 0; i < input.length; i += 1) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * 0x100000001b3n) & MASK64;
  }
  return h.toString(16).padStart(16, '0');
}
