/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE — CANONICAL OTC DISPLAY NAME FORMATTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported 1:1 from legacy src/lib/otc/displayName.js. ONE formatter used
 * everywhere an asset name appears. Strips any existing OTC markers from the
 * raw name, then appends exactly ONE standardized " (OTC)" suffix. Internal
 * symbol IDs (BTCUSD-OTC, EURUSD-OTC) are NEVER changed — display only.
 */

/** Strip all existing OTC markers from a raw display name. */
export function stripOtcMarkers(raw: string | null | undefined): string {
  if (!raw) return '';
  let name = String(raw).trim();
  // Repeatedly strip "(OTC)" and trailing "OTC" until stable.
  let prev: string;
  do {
    prev = name;
    name = name.replace(/\s*\(OTC\)\s*/gi, ' ').trim();
    name = name.replace(/\s*OTC\s*$/i, '').trim();
    name = name.replace(/\s*\/\s*OTC\s*$/i, '').trim();
  } while (name !== prev);
  return name.trim();
}

/** Format an asset display name with exactly ONE "(OTC)" suffix. */
export function formatOtcDisplayName(rawName: string | null | undefined, marketType?: string): string {
  const base = stripOtcMarkers(rawName);
  if (marketType === 'OTC' || /otc/i.test(String(rawName || ''))) {
    return base ? `${base} (OTC)` : '(OTC)';
  }
  return base || String(rawName || '');
}

/**
 * Format any asset for display — OTC assets get the "(OTC)" suffix, non-OTC
 * assets pass through unchanged.
 */
export function formatAssetName(asset: {
  name?: string | null;
  symbol?: string | null;
  provider?: string;
  otc?: boolean;
  marketType?: string;
} | null | undefined): string {
  if (!asset) return '';
  const isOtc = asset.provider === 'OTC' || asset.otc || asset.marketType === 'OTC';
  const rawName = asset.name || asset.symbol || '';
  return isOtc ? formatOtcDisplayName(rawName, 'OTC') : String(rawName);
}
