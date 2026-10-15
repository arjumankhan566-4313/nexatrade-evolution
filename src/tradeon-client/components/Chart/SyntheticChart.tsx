/**
 * SyntheticChart — the Chart Lab's chart host.
 *
 * Mounts the native Canvas engine (ChartEngine) over LOCALLY generated candles,
 * so Chart Lab can exercise the renderer — zoom, pan, crosshair, theme —
 * without the live OTC feed. Mount/resize wiring mirrors CanvasChart; it has no
 * toolbar and no trade overlays by design.
 */
import { useEffect, useRef } from "react";
import { ChartEngine } from "../../chart/ChartEngine";
import type { Candle, ChartTheme } from "../../chart/types";

export interface EngineState {
  barWidth: number;
  viewRight: number;
  candles: number;
  dpr: number;
  cssW: number;
  cssH: number;
}

interface Props {
  candles: Candle[];
  theme: ChartTheme;
  /** Polled twice a second so the lab can read out what the engine is doing. */
  onState?: (state: EngineState) => void;
}

export default function SyntheticChart({ candles, theme, onState }: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  // Boot the engine once; the theme is applied by its own effect below.
  useEffect(() => {
    if (!baseRef.current || !overlayRef.current) return;
    const engine = new ChartEngine(baseRef.current, overlayRef.current, {
      theme: themeRef.current,
    });
    engineRef.current = engine;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) engine.resize(width, height);
      }
    });
    if (areaRef.current) {
      ro.observe(areaRef.current);
      requestAnimationFrame(() => {
        const rect = areaRef.current?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) engine.resize(rect.width, rect.height);
      });
    }

    const poll = window.setInterval(() => {
      const s = engine._state;
      onStateRef.current?.({
        barWidth: s.barWidth,
        viewRight: s.viewRight,
        candles: s.candles,
        dpr: s.dpr,
        cssW: s.cssW,
        cssH: s.cssH,
      });
    }, 500);

    return () => {
      window.clearInterval(poll);
      ro.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setCandles(candles);
  }, [candles]);

  useEffect(() => {
    engineRef.current?.setTheme(theme);
  }, [theme]);

  return (
    <div className="chart-canvas-wrap">
      <div className="chart-canvas-area" ref={areaRef}>
        <canvas className="chart-layer chart-layer--base" ref={baseRef} />
        <canvas className="chart-layer chart-layer--overlay" ref={overlayRef} />
      </div>
    </div>
  );
}
