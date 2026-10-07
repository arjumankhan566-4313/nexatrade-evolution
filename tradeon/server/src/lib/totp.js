import crypto from 'crypto';

/**
 * Minimal RFC 6238 TOTP (time-based one-time password) + RFC 4648 Base32.
 * Dependency-free — built on Node's crypto HMAC-SHA1. Used for the 2FA setup
 * flow in the Security panel (Spec §6.9). No external auth library needed.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(counter >>> 0, 4);
  const h = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

/** Current TOTP code for a base32 secret (30s window, ±1 window tolerance). */
export function totpCode(secret, offset = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + offset;
  return hotp(base32Decode(secret), counter);
}

export function verifyTotp(secret, code) {
  const c = String(code || '').trim();
  if (!/^\d{6}$/.test(c)) return false;
  // ±1 window for clock drift
  for (let off = -1; off <= 1; off += 1) {
    if (totpCode(secret, off) === c) return true;
  }
  return false;
}

/** otpauth:// URI for QR rendering. */
export function otpauthUri(secret, account = 'TRADEON', issuer = 'TRADEON') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Generate a fresh 20-byte secret, base32-encoded. */
export function newTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

/** Generate 8 single-use backup codes. */
export function newBackupCodes() {
  return Array.from({ length: 8 }, () =>
    crypto.randomBytes(6).toString('hex').toUpperCase().replace(/(.{4})(?=.)/g, '$1-')
  );
}

export function normalizeBackupCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-F0-9]/g, '');
}

/** Backup codes are password-equivalents: persist only one-way digests. */
export function hashBackupCode(code) {
  return `sha256:${crypto.createHash('sha256').update(normalizeBackupCode(code)).digest('hex')}`;
}

export function verifyBackupCode(stored, candidate) {
  const normalized = normalizeBackupCode(candidate);
  if (!normalized) return false;
  const expected = String(stored || '').startsWith('sha256:')
    ? String(stored)
    : hashBackupCode(stored); // compatibility with previously issued plaintext rows
  const actual = hashBackupCode(normalized);
  return expected.length === actual.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
