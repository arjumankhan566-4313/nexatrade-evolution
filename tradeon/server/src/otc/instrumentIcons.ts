/**
 * OTC instrument artwork — the single source for every official market logo
 * (company marks for stocks, coin marks for crypto, flags for currencies,
 * regional/commodity artwork for the rest).
 *
 * Moved here from `routes/otcAdmin.ts` so BOTH the admin console and the
 * public catalogue (`GET /api/market/otc/assets`) resolve the same icon URL
 * for an instrument instead of duplicating the mapping.
 */
import { cryptoIconPath, INSTRUMENT_ICONS, marketIconUrl } from '../admin/lib/assetIconMap';

const instrumentIcons: Record<string, string> = INSTRUMENT_ICONS;

/** Currency → bundled flag artwork in `public/market-icons`. */
const CURRENCY_FLAGS: Record<string, string> = {
  USD: 'us.png',
  EUR: 'eu.png',
  GBP: 'gb.png',
  JPY: 'jp.png',
  CHF: 'ch.png',
  CAD: 'ca.png',
  AUD: 'au.png',
  NZD: 'nz.png',
  SGD: 'sg.png',
  HKD: 'hk.png',
  TRY: 'tr.png',
  MXN: 'mx.png',
  ZAR: 'za.png',
  INR: 'in.png',
  BDT: 'bd.png',
  SEK: 'se.png',
  NOK: 'no.png',
  THB: 'th.svg',
  IDR: 'id.svg',
  CNH: 'cn.svg',
  CNY: 'cn.svg',
  DKK: 'dk.svg',
  PLN: 'pl.svg',
  PKR: 'flag-pk.png',
  PHP: 'flag-ph.png',
  BRL: 'flag-br.png',
  ARS: 'flag-ar.png',
  CLP: 'flag-cl.png',
  COP: 'flag-co.png',
  ILS: 'flag-il.png',
  KRW: 'flag-kr.png',
  TWD: 'flag-tw.png',
  VND: 'flag-vn.png',
  EGP: 'flag-eg.png',
  NGN: 'flag-ng.png',
  KES: 'flag-ke.png',
  PEN: 'flag-pe.png',
  HUF: 'flag-hu.png',
  CZK: 'flag-cz.png',
  RON: 'flag-ro.png',
  RUB: 'flag-ru.png',
  JOD: 'flag-jo.png',
};

/** Resolve a single icon URL for an OTC instrument (unversioned path). */
export function otcIconUrl(symbol: string, category: string, base: string): string | null {
  const ticker = symbol.replace(/-OTC$/i, '').replace(/USD$|EUR$|GBP$|JPY$/, '');
  if (category === 'CRYPTO') return cryptoIconPath(base);
  if (category === 'FOREX') {
    const metal = instrumentIcons[symbol.replace(/-OTC$/i, '')];
    if (metal) return `/market-icons/${metal}`;
    const flag = CURRENCY_FLAGS[String(base).toUpperCase()];
    return flag ? `/market-icons/${flag}` : null;
  }
  // STOCK, INDEX, COMMODITY — use the instrument icon map
  const raw = symbol.replace(/-OTC$/i, '');
  const icon = instrumentIcons[raw] || instrumentIcons[ticker];
  return icon ? `/market-icons/${icon}` : null;
}

/**
 * Versioned icon URL for browser display — busts older immutable responses
 * after artwork additions or corrections (`?v=3`).
 */
export function otcIconUrlVersioned(symbol: string, category: string, base: string): string | null {
  return marketIconUrl(otcIconUrl(symbol, category, base));
}
