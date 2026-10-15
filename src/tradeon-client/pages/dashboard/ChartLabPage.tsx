/**
 * ChartLabPage — demo + QA surface for the native Canvas chart engine.
 *
 * Legacy parity: src/app/dashboard/chart-lab/page.jsx did the same for the
 * ECharts engine. Mock OHLCV is generated locally with a deterministic PRNG and
 * fed straight into the engine, so the lab exercises the renderer — zoom, pan,
 * crosshair, theme, stress ticks — without touching the live OTC feed.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import SyntheticChart, { type EngineState } from "../../components/Chart/SyntheticChart";
import { CHART_THEME } from "../../chart/theme";
import type { Candle, ChartTheme } from "../../chart/types";
import "../../styles/legacy-pages.css";
import "../../styles/chart.css";
import "../../styles/chart-lab.css";

/* Timeframe presets: candle length plus the drift scale the simulator uses. */
const TF: Record<string, { interval: number; vol: number }> = {
  "1m": { interval: 60, vol: 0.0009 },
  "5m": { interval: 300, vol: 0.0016 },
  "1h": { interval: 3600, vol: 0.0035 },
  "1D": { interval: 86400, vol: 0.011 },
};

const START = 1.08;

const LIGHT_THEME: ChartTheme = {
  bg: "#ffffff",
  grid: "rgba(15,23,42,0.08)",
  axisText: "#5b6472",
  up: "#0a9e6f",
  down: "#dc3a44",
  priceLine: "#2583ff",
  priceLabelBg: "#2583ff",
  priceLabelText: "#ffffff",
  crosshair: "#94a3b8",
  crosshairText: "#ffffff",
};

let seedCounter = 1;

/** Deterministic PRNG so each timeframe render is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function genCandles(tf: string, n = 260, seed?: number): Candle[] {
  const { interval, vol } = TF[tf] ?? TF["1m"];
  const rand = rng(seed ?? (seedCounter += 7));
  const lastBucket = Math.floor(Date.now() / 1000 / interval) * interval;
  const out: Candle[] = [];
  let price = START * (1 + (rand() - 0.5) * 0.04);
  for (let i = n - 1; i >= 0; i -= 1) {
    const open = price;
    const close = Math.max(0.0001, open * (1 + (rand() - 0.49) * vol));
    const wick = vol * (0.5 + rand() * 1.6);
    out.push({
      time: lastBucket - i * interval,
      open,
      high: Math.max(open, close) * (1 + wick * 0.45),
      low: Math.min(open, close) * (1 - wick * 0.45),
      close,
      tickCount: 0,
      finalized: true,
    });
    price = close;
  }
  return out;
}

export default function ChartLabPage() {
  const [tf, setTf] = useState("1m");
  const [candles, setCandles] = useState<Candle[]>(() => genCandles("1m", 240, 42));
  const [live, setLive] = useState(true);
  const [burst, setBurst] = useState(false);
  const [light, setLight] = useState(false);
  const [ticks, setTicks] = useState(0);
  const [engineState, setEngineState] = useState<EngineState | null>(null);

  const tfRef = useRef(tf);
  tfRef.current = tf;
  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  const theme = useMemo(() => (light ? LIGHT_THEME : CHART_THEME), [light]);

  const regenerate = (next: string) => {
    setTf(next);
    setCandles(genCandles(next, next === "1m" ? 300 : 240, (seedCounter += 11)));
    setTicks(0);
  };

  /* Live simulator — one tick per interval at the current timeframe. */
  useEffect(() => {
    if (!live) return undefined;
    const { interval, vol } = TF[tfRef.current] ?? TF["1m"];
    const id = window.setInterval(() => {
      const prev = candlesRef.current;
      if (!prev.length) return;
      const last = prev[prev.length - 1];
      const bucket = Math.floor(Date.now() / 1000 / interval) * interval;
      const close = Math.max(0.0001, last.close * (1 + (Math.random() - 0.493) * vol));
      const wick = vol * (0.4 + Math.random() * 1.2);
      const forming: Candle = {
        time: bucket,
        open: bucket === last.time ? last.open : last.close,
        high: Math.max(last.close, close) * (1 + wick * 0.4),
        low: Math.min(last.close, close) * (1 - wick * 0.4),
        close,
        tickCount: last.tickCount + 1,
        finalized: false,
      };
      const next = prev.slice();
      if (bucket === last.time) {
        next[next.length - 1] = forming;
      } else {
        next[next.length - 1] = { ...last, finalized: true };
        next.push(forming);
      }
      setCandles(next.length > 520 ? next.slice(next.length - 520) : next);
      setTicks((t) => t + 1);
    }, 900);
    return () => window.clearInterval(id);
  }, [live]);

  /* ~40Hz micro-tick burst — the renderer's stress mode. */
  useEffect(() => {
    if (!burst) return undefined;
    const { vol } = TF[tfRef.current] ?? TF["1m"];
    const id = window.setInterval(() => {
      const prev = candlesRef.current;
      if (!prev.length) return;
      const last = prev[prev.length - 1];
      const close = Math.max(0.0001, last.close * (1 + (Math.random() - 0.5) * vol * 0.14));
      const next = prev.slice();
      next[next.length - 1] = {
        ...last,
        close,
        high: Math.max(last.high, close),
        low: Math.min(last.low, close),
        tickCount: last.tickCount + 1,
      };
      setCandles(next);
      setTicks((t) => t + 1);
    }, 24);
    return () => window.clearInterval(id);
  }, [burst]);

  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const isUp = (last?.close ?? 0) >= (previous?.close ?? last?.close ?? 0);

  return (
    <div className="legacy-page chart-lab">
      <header className="lab-head">
        <div>
          <h1>Chart Lab</h1>
          <p>Native Canvas engine — crosshair · zoom / pan · auto-scaled axes · stress ticks</p>
        </div>
        <div className="lab-tfs">
          {Object.keys(TF).map((key) => (
            <button
              key={key}
              type="button"
              className={tf === key ? "active" : ""}
              onClick={() => regenerate(key)}
            >
              {key}
            </button>
          ))}
        </div>
      </header>

      <div className="lab-bar">
        <div className="lab-price">
          <span className={`dot ${isUp ? "up" : "down"}`} />
          <strong className="mono">{last ? last.close.toFixed(5) : "—"}</strong>
          <em className="muted">
            {candles.length} candles · {tf} · {ticks} ticks
          </em>
        </div>
        <div className="lab-actions">
          <button type="button" className={live ? "active" : ""} onClick={() => setLive((v) => !v)}>
            {live ? "⏸ Pause live" : "▶ Play live"}
          </button>
          <button
            type="button"
            className={burst ? "active" : ""}
            onClick={() => setBurst((v) => !v)}
          >
            ⚡ 40Hz burst
          </button>
          <button
            type="button"
            className={light ? "active" : ""}
            onClick={() => setLight((v) => !v)}
          >
            {light ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </div>

      <div className="lab-chart">
        <SyntheticChart candles={candles} theme={theme} onState={setEngineState} />
      </div>

      <div className="lab-foot">
        <div>
          <span>Candles in engine</span>
          <strong className="mono">{engineState?.candles ?? candles.length}</strong>
        </div>
        <div>
          <span>Bar width</span>
          <strong className="mono">
            {engineState ? `${engineState.barWidth.toFixed(1)}px` : "—"}
          </strong>
        </div>
        <div>
          <span>Right-edge index</span>
          <strong className="mono">{engineState ? engineState.viewRight.toFixed(1) : "—"}</strong>
        </div>
        <div>
          <span>Canvas</span>
          <strong className="mono">
            {engineState
              ? `${Math.round(engineState.cssW)}×${Math.round(engineState.cssH)} @ ${engineState.dpr.toFixed(2)}×`
              : "—"}
          </strong>
        </div>
      </div>
    </div>
  );
}
