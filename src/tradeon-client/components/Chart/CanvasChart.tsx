/**
 * CanvasChart — mounts the native HTML5 Canvas chart engine and feeds it the
 * live OTC feed. Pure canvas: no charting library touches the DOM. The engine
 * owns the render loop; this component only forwards candles and the
 * data-anchored trade overlays (entry/exit lines + dots) and the crosshair
 * readout.
 *
 * It renders the market/timeframe toolbar (when the parent supplies the
 * handlers — blueprint 3.2: the parent owns the selected market so it is never
 * duplicated) above the canvas area, plus the floating candle countdown.
 *
 * The live feed arrives as Micro-JSON tuples and is parsed in useOtcFeed; the
 * trade overlays are built from the user's own trades in chart/tradeOverlays.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChartEngine } from '../../chart/ChartEngine';
import { formatDateTime, formatPrice } from '../../chart/format';
import { buildTradeOverlays } from '../../chart/tradeOverlays';
import { useOtcFeed } from '../../hooks/useOtcFeed';
import { useMyTrades } from '../../hooks/useMyTrades';
import ChartToolbar from './ChartToolbar';
import { CHART_THEME } from '../../chart/theme';
import ChartTools, { type ChartType } from './ChartTools';
import CandleCountdown from './CandleCountdown';
import '../../styles/chart.css';

interface Props {
  symbol: string;
  timeframe: string;
  /** Canonical catalogue name for the toolbar's market trigger. */
  assetName?: string;
  /** Opens the parent's market catalogue (all OTC instruments). */
  onOpenMarket?: () => void;
  onTimeframeChange?: (t: string) => void;
  /** Painting style of the series — candles (default), OHLC bars or a line. */
  chartType?: ChartType;
  onChartTypeChange?: (t: ChartType) => void;
  /** Give this chart's OTC feed its own socket (multi-chart workspaces). */
  dedicatedSocket?: boolean;
  /** Report the live OTC price upward (the page's ticket marks against it). */
  onLivePrice?: (price: number | null) => void;
}

/* Parse a timeframe string (e.g. '1m', '5s', '1h') into milliseconds */
function timeframeToMs(tf: string): number {
  const m = tf.match(/^(\d+)([smh])$/);
  if (!m) return 60_000;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  return n * (unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000);
}

export default function CanvasChart({
  symbol,
  timeframe,
  assetName,
  onOpenMarket,
  onTimeframeChange,
  chartType = 'candles',
  onChartTypeChange,
  dedicatedSocket,
  onLivePrice,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Crosshair + axis tooltips live on their own layer, over the candles. */
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const [readout, setReadout] = useState<string | null>(null);
  /** Y of the live-price line, so the countdown can sit exactly on it. */
  const [priceLineY, setPriceLineY] = useState<number | null>(null);
  const priceLineYRef = useRef<number | null>(null);
  /** Latest history pager, read by the engine's prefetch callback. */
  const loadOlderRef = useRef<(() => Promise<void>) | null>(null);
  /** The countdown pill: its measured width tells the engine where the
   *  dashed price line starts (pill width + COUNTDOWN_GAP_PX). */
  const timerRef = useRef<HTMLDivElement>(null);

  const { candles, livePrice, status, loadOlder, serverTimeOffset } = useOtcFeed(symbol, timeframe, { dedicatedSocket });
  const { trades } = useMyTrades();
  const bucketMs = timeframeToMs(timeframe);

  // Entry/exit marks, anchored to (candle index, price) so the engine keeps
  // them glued to their candles through zoom/pan (rebuilt as candles shift).
  const overlays = useMemo(
    () => buildTradeOverlays(trades, candles, bucketMs, symbol),
    [trades, candles, bucketMs, symbol]
  );

  useEffect(() => {
    loadOlderRef.current = loadOlder;
  }, [loadOlder]);

  // Boot the engine once.
  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current) return;
    const engine = new ChartEngine(canvasRef.current, overlayRef.current, {
      theme: CHART_THEME,
      // Crosshair readout: the snapped candle's own OHLC + its exact time.
      onCrosshair: (info) =>
        setReadout(
          info
            ? `O ${formatPrice(info.candle.open)}  H ${formatPrice(info.candle.high)}  ` +
              `L ${formatPrice(info.candle.low)}  C ${formatPrice(info.candle.close)}  ·  ${formatDateTime(info.time)}`
            : null
        ),
      // Infinite left-scroll: page older candles in, then release the latch.
      onNeedOlder: () => {
        const run = loadOlderRef.current;
        if (!run) {
          engineRef.current?.setOlderPending(false);
          return;
        }
        void run().finally(() => engineRef.current?.setOlderPending(false));
      },
      // Anchor the countdown badge on the live-price line, to the whole pixel.
      onPriceLineY: (y) => {
        const next = y == null ? null : Math.round(y);
        if (next === priceLineYRef.current) return;
        priceLineYRef.current = next;
        setPriceLineY(next);
      },
    });
    engineRef.current = engine;
    // Dev-only handle so the real browser can be inspected/verified without
    // guessing at canvas pixels. Stripped from production builds.
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nexaChartEngine = engine;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) engine.resize(width, height);
      }
    });
    if (areaRef.current) {
      ro.observe(areaRef.current);
      requestAnimationFrame(() => {
        if (!areaRef.current) return;
        const rect = areaRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) engine.resize(rect.width, rect.height);
      });
    }

    return () => {
      ro.disconnect();
      engine.destroy();
      engineRef.current = null;
      if (import.meta.env.DEV) delete (window as unknown as Record<string, unknown>).__nexaChartEngine;
    };
  }, []);

  // Feed candles + anchored overlays whenever they change.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (areaRef.current && (!canvasRef.current || canvasRef.current.height === 0)) {
      const rect = areaRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) engine.resize(rect.width, rect.height);
    }
    engine.setCandles(candles);
  }, [candles]);

  useEffect(() => {
    engineRef.current?.setOverlays(overlays);
  }, [overlays]);

  // Pull the admin-chosen countdown color once (and bind live updates).
  useEffect(() => {
    void useChartConfigStore.getState().loadFromServer();
  }, []);

  // Keep the engine informed of the countdown pill's width, so the dashed
  // price line starts a clean COUNTDOWN_GAP_PX after it (B5). The pill hides
  // when the price line is off-plot — then the line spans the full width.
  useEffect(() => {
    const el = timerRef.current;
    const engine = engineRef.current;
    if (!engine) return;
    if (!el) {
      engine.setCountdownInset(0);
      return;
    }
    const measure = () => engine.setCountdownInset(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [priceLineY]);

  // Chart type is a paint style, so it only needs a base repaint.
  useEffect(() => {
    engineRef.current?.setChartType(chartType);
  }, [chartType]);

  // Surface the live price to the parent (the trade ticket marks against it).
  useEffect(() => {
    onLivePrice?.(livePrice ?? null);
  }, [livePrice, onLivePrice]);

  return (
    <div className="chart-canvas-wrap">
      {onOpenMarket && (
        <ChartToolbar
          symbol={symbol}
          assetName={assetName}
          onOpenMarket={onOpenMarket}
          livePrice={livePrice}
          status={status}
        />
      )}

      <div className="chart-canvas-area" ref={areaRef}>
        {/* Layer 1 — candles, grid, overlays. Layer 2 — crosshair + axis
            tooltips, so moving the mouse never repaints the candles. */}
        <canvas className="chart-layer chart-layer--base" ref={canvasRef} />
        <canvas className="chart-layer chart-layer--overlay" ref={overlayRef} />

        {/* Candle countdown, anchored to the white live-price line: it rides
            the same Y through ticks, pan and zoom, just left of the badge. */}
        {priceLineY != null && (
          <div className="chart-live-timer" ref={timerRef} style={{ top: `${priceLineY}px` }}>
            <CandleCountdown bucketMs={bucketMs} serverTimeOffset={serverTimeOffset} />
          </div>
        )}

        {/* Floating tool column: drawing tools, timeframe, chart type. */}
        {onTimeframeChange && onChartTypeChange && (
          <ChartTools
            timeframe={timeframe}
            onTimeframeChange={onTimeframeChange}
            chartType={chartType}
            onChartTypeChange={onChartTypeChange}
          />
        )}

        {readout && <div className="chart-crosshair-readout">{readout}</div>}
        {status === 'loading' && !candles.length && <div className="chart-empty">Loading OTC candles…</div>}
        {status === 'error' && !candles.length && <div className="chart-empty">Unable to load candles.</div>}
      </div>
    </div>
  );
}
