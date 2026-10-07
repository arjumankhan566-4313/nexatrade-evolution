/**
 * luminance.ts — color math for admin-controllable chart UI colors.
 *
 * The countdown pill's background can be set by an admin to ANY color, so the
 * text on top of it cannot be a fixed value: it must switch between light and
 * dark by the background's perceived brightness (WCAG relative luminance).
 */

/** Parse '#rgb' / '#rrggbb' (case-insensitive) into [r, g, b] 0–255. */
export function parseHexColor(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * WCAG 2.x relative luminance (0 = black, 1 = white). Each channel is
 * linearised (sRGB gamma expansion) before applying the Rec. 709 weights.
 */
export function relativeLuminance(hex: string): number {
  const rgb = parseHexColor(hex);
  if (!rgb) return 0;
  const lin = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * The readable text color for a given background: dark text on light
 * backgrounds, white text on dark ones. Threshold 0.179 is the WCAG point
 * where contrast against white and against near-black crosses over.
 */
export function readableTextColor(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.179 ? '#0d111a' : '#ffffff';
}
