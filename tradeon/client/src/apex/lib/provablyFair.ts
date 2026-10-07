/**
 * Feature 4 — real in-browser fairness verification.
 *
 * This module contains no mock data: it computes genuine SHA-256 and
 * HMAC-SHA256 digests with the Web Crypto API. The commit–reveal contract is:
 *
 *   commitment  = SHA-256(serverSeed)                      published before the round
 *   draw        = HMAC-SHA256(key = serverSeed,            recomputable afterwards
 *                            message = `${clientSeed}:${nonce}`)
 *
 * Anyone holding the revealed server seed can recompute both values and check
 * them against what was published, without trusting the server.
 */

export type FairnessInput = {
  serverSeed: string;
  clientSeed: string;
  nonce: string;
};

export type FairnessOutcome = {
  /** Value published before the round. */
  commitment: string;
  /** Settlement digest recomputed from the revealed seeds. */
  resultHash: string;
  /** The exact message that was hashed, so the user can audit it. */
  message: string;
  /** null when no published hash was supplied to compare against. */
  matches: boolean | null;
};

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** True when the page runs in a context where Web Crypto's subtle API exists. */
export function isWebCryptoAvailable(): boolean {
  return typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle !== 'undefined';
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text));
  return toHex(digest);
}

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return toHex(signature);
}

export function fairnessMessage({ clientSeed, nonce }: Pick<FairnessInput, 'clientSeed' | 'nonce'>): string {
  return `${clientSeed}:${nonce}`;
}

export async function computeCommitment(serverSeed: string): Promise<string> {
  return sha256Hex(serverSeed);
}

export async function computeResultHash(input: FairnessInput): Promise<string> {
  return hmacSha256Hex(input.serverSeed, fairnessMessage(input));
}

/**
 * Runs the full verification. `publishedHash` is what the operator published;
 * pass an empty string to skip the comparison and only inspect the digests.
 */
export async function verifyFairness(
  input: FairnessInput,
  publishedHash: string
): Promise<FairnessOutcome> {
  const [commitment, resultHash] = await Promise.all([
    computeCommitment(input.serverSeed),
    computeResultHash(input),
  ]);

  const expected = publishedHash.trim().toLowerCase();

  return {
    commitment,
    resultHash,
    message: fairnessMessage(input),
    matches: expected.length === 0 ? null : expected === resultHash.toLowerCase(),
  };
}
