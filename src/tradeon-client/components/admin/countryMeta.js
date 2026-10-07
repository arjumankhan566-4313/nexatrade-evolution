/**
 * Lightweight country metadata (flag + geo coordinates) used by the admin
 * world heatmap. Falls back to a neutral placeholder for unknown codes so
 * the map still renders real user-density data even for unlisted countries.
 */
export const COUNTRY_META = {
  BD: { flag: '🇧🇩', name: 'Bangladesh', lat: 23.7, lng: 90.4 },
  IN: { flag: '🇮🇳', name: 'India', lat: 20.6, lng: 79.0 },
  PK: { flag: '🇵🇰', name: 'Pakistan', lat: 30.4, lng: 69.3 },
  US: { flag: '🇺🇸', name: 'United States', lat: 37.0, lng: -95.7 },
  GB: { flag: '🇬🇧', name: 'United Kingdom', lat: 51.5, lng: -0.12 },
  CA: { flag: '🇨🇦', name: 'Canada', lat: 56.1, lng: -106.3 },
  AU: { flag: '🇦🇺', name: 'Australia', lat: -25.3, lng: 133.8 },
  AE: { flag: '🇦🇪', name: 'United Arab Emirates', lat: 23.4, lng: 54.4 },
  SA: { flag: '🇸🇦', name: 'Saudi Arabia', lat: 24.0, lng: 45.0 },
  MY: { flag: '🇲🇾', name: 'Malaysia', lat: 4.2, lng: 101.9 },
  SG: { flag: '🇸🇬', name: 'Singapore', lat: 1.35, lng: 103.8 },
  ID: { flag: '🇮🇩', name: 'Indonesia', lat: -0.79, lng: 113.9 },
  PH: { flag: '🇵🇭', name: 'Philippines', lat: 12.9, lng: 121.8 },
  NG: { flag: '🇳🇬', name: 'Nigeria', lat: 9.1, lng: 8.7 },
  ZA: { flag: '🇿🇦', name: 'South Africa', lat: -30.6, lng: 22.9 },
  DE: { flag: '🇩🇪', name: 'Germany', lat: 51.2, lng: 10.4 },
  FR: { flag: '🇫🇷', name: 'France', lat: 46.2, lng: 2.2 },
  ES: { flag: '🇪🇸', name: 'Spain', lat: 40.5, lng: -3.7 },
  IT: { flag: '🇮🇹', name: 'Italy', lat: 41.9, lng: 12.6 },
  TR: { flag: '🇹🇷', name: 'Türkiye', lat: 39.0, lng: 35.2 },
  BR: { flag: '🇧🇷', name: 'Brazil', lat: -14.2, lng: -51.9 },
  JP: { flag: '🇯🇵', name: 'Japan', lat: 36.2, lng: 138.3 },
  MX: { flag: '🇲🇽', name: 'Mexico', lat: 23.6, lng: -102.5 },
};

const FALLBACK = { flag: '🌐', name: '', lat: 20, lng: 0 };

export function countryMeta(code) {
  const c = (code || '').toUpperCase();
  const meta = COUNTRY_META[c];
  return meta ? { code: c, ...meta } : { code: c, ...FALLBACK, name: code || 'Unknown' };
}

/** Gateway brand colors for the payment-funnel donut (deterministic by code). */
export const GATEWAY_COLORS = [
  '#00f2fe', // cyan
  '#10b981', // emerald
  '#7c8cff', // violet
  '#f43f5e', // crimson
  '#fbbf24', // amber
  '#22d3ee',
  '#a78bfa',
  '#fb7185',
];

export function gatewayColor(code, index) {
  const c = (code || '').toUpperCase();
  const branded = {
    BKASH: '#e2136e',
    NAGAD: '#f59e0b',
    ROCKET: '#8b2fc9',
    USDT_TRC20: '#26a17b',
    USDT_ERC20: '#26a17b',
    BITCOIN: '#f7931a',
    ETHEREUM: '#627eea',
    BANK_TRANSFER: '#10b981',
    CARD: '#7c8cff',
  };
  if (branded[c]) return branded[c];
  return GATEWAY_COLORS[index % GATEWAY_COLORS.length];
}
