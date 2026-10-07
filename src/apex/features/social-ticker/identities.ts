/**
 * Masked, non-identifying handles for the live activity ticker.
 *
 * Two shapes are mixed so the stream reads like a real platform: human name
 * masks (first name / initial + masked surname) and truncated crypto-wallet
 * addresses. Nothing here maps to an actual account — the masks are opaque and
 * deliberately un-reversible.
 */

export type MaskedIdentity = {
  /** The handle exactly as it renders in the toast. */
  mask: string;
  kind: 'name' | 'wallet';
};

export const MASKED_IDENTITIES: readonly MaskedIdentity[] = [
  { mask: 'Alex M.***', kind: 'name' },
  { mask: 'Dav***', kind: 'name' },
  { mask: 'S. Rahman***', kind: 'name' },
  { mask: 'Priya N.***', kind: 'name' },
  { mask: 'M. Okafor***', kind: 'name' },
  { mask: 'Jonas K.***', kind: 'name' },
  { mask: 'L. Fernández***', kind: 'name' },
  { mask: 'Yuki T.***', kind: 'name' },
  { mask: 'Ahmed R.***', kind: 'name' },
  { mask: 'Nadia S.***', kind: 'name' },
  { mask: 'Tomás V.***', kind: 'name' },
  { mask: 'Chen W.***', kind: 'name' },
  { mask: 'Marco D.***', kind: 'name' },
  { mask: 'E. Petrova***', kind: 'name' },
  { mask: 'Kwame A.***', kind: 'name' },
  { mask: 'Sofía L.***', kind: 'name' },
  { mask: '0x7F...9b2', kind: 'wallet' },
  { mask: 'bc1q...x8', kind: 'wallet' },
  { mask: '0x3A...c41', kind: 'wallet' },
  { mask: 'TQr8...m2', kind: 'wallet' },
  { mask: '0x9d...E04', kind: 'wallet' },
  { mask: 'bc1p...k3', kind: 'wallet' },
  { mask: '0xB2...f0e', kind: 'wallet' },
  { mask: '0x4C...a7d', kind: 'wallet' },
] as const;
