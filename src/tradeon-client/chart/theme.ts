/**
 * CHART_THEME — the canvas engine's dark palette.
 *
 * Lives outside the chart components so `ChartToolbar` exports only its
 * component (a stray non-component export makes Vite fall back to a full
 * Fast Refresh invalidation on every edit). Values are the visual contract:
 * an opaque WHITE price line with a BLUE badge, Binance-style green/red
 * candles.
 */
import type { ChartTheme } from './types';

export const CHART_THEME: ChartTheme = {
  bg: '#0b0e11',
  grid: '#1a2230',
  axisText: '#8b95a7',
  up: '#0ecb81',
  down: '#f6465d',
  priceLine: '#ffffff',
  priceLabelBg: '#2986ff',
  priceLabelText: '#ffffff',
  crosshair: '#5b6677',
  crosshairText: '#c7ccd6',
};
