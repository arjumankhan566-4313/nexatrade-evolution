import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GlassCard, CardHead, LivePill } from "./ui";

/* Hand-rolled candlestick renderer (real OHLC from the market feed). */
function Candles({ data }) {
  const W = 400;
  const H = 132;
  const padX = 6;
  const padY = 10;

  const { min, max, candles } = useMemo(() => {
    if (!data?.length) return { min: 0, max: 1, candles: [] };
    const lows = data.map((d) => d.low);
    const highs = data.map((d) => d.high);
    return { min: Math.min(...lows), max: Math.max(...highs), candles: data };
  }, [data]);

  const span = max - min || 1;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const slot = innerW / Math.max(1, candles.length - 1);
  const bw = Math.min(8, slot * 0.55);
  const y = (v) => padY + (1 - (v - min) / span) * innerH;
  const last = candles[candles.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", display: "block" }}>
      {[0.2, 0.4, 0.6, 0.8].map((f, i) => (
        <line
          key={i}
          x1={padX}
          y1={padY + f * innerH}
          x2={W - padX}
          y2={padY + f * innerH}
          stroke="rgba(148,197,255,0.05)"
        />
      ))}
      {[max, max - span * 0.5, min].map((v, i) => (
        <text key={i} x={2} y={y(v) + 3} fontSize="7" fill="#4a5870" fontFamily="var(--mono)">
          {v >= 100 ? v.toFixed(0) : v.toFixed(v < 2 ? 3 : 1)}
        </text>
      ))}
      {last && (
        <line
          x1={padX}
          y1={y(last.close)}
          x2={W - padX}
          y2={y(last.close)}
          stroke="rgba(0,242,254,0.28)"
          strokeDasharray="3 3"
        />
      )}
      {candles.map((c, i) => {
        const cx = padX + i * slot;
        const up = c.close >= c.open;
        const color = up ? "#10b981" : "#f43f5e";
        const yO = y(c.open);
        const yC = y(c.close);
        const yH = y(c.high);
        const yL = y(c.low);
        return (
          <g key={i}>
            <line x1={cx} y1={yH} x2={cx} y2={yL} stroke={color} strokeWidth={1.1} />
            <rect
              x={cx - bw / 2}
              y={Math.min(yO, yC)}
              width={bw}
              height={Math.max(1, Math.abs(yC - yO))}
              rx={0.6}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function TradingActivity({ markets, candles, callPut, feed, loadCandles }) {
  const [symbol, setSymbol] = useState(markets[0]?.symbol || "");
  const market = markets.find((m) => m.symbol === symbol) || markets[0];
  const cdata = candles[symbol] || [];
  const cp = callPut.find((c) => c.symbol === symbol);

  useEffect(() => {
    if (symbol && (!candles[symbol] || candles[symbol].length === 0)) loadCandles(symbol);
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!markets.length) return null;

  const feedLabel = feed === "live" ? "LIVE" : feed === "offline" ? "FEED OFFLINE" : "CONNECTING";
  const feedVariant = feed === "live" ? undefined : "cyan";

  return (
    <GlassCard delay={0.3}>
      <CardHead
        eyebrow="Trading activity"
        title="Candlestick · CALL vs PUT flow"
        sub="Real market candles + order-flow from settled trades"
        right={<LivePill label={feedLabel} variant={feedVariant} />}
      />

      {/* market selector (real active assets) */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {markets.map((m) => {
          const active = m.symbol === symbol;
          return (
            <button
              key={m.symbol}
              onClick={() => setSymbol(m.symbol)}
              style={{
                border: `1px solid ${active ? "rgba(0,242,254,0.4)" : "rgba(148,197,255,0.1)"}`,
                background: active ? "rgba(0,242,254,0.1)" : "rgba(255,255,255,0.02)",
                color: active ? "#00f2fe" : "#74839a",
                borderRadius: 8,
                padding: "5px 11px",
                fontSize: 10.5,
                fontWeight: 700,
                fontFamily: "var(--mono)",
                boxShadow: active ? "0 0 18px rgba(0,242,254,0.25)" : "none",
                transition: "0.2s",
              }}
            >
              {m.symbol}
            </button>
          );
        })}
      </div>

      {/* candlestick price (real feed) */}
      <div style={{ height: 150 }}>
        {cdata.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "#5b6a85",
              fontSize: 11,
            }}
          >
            {feed === "offline"
              ? "Market feed offline — no fabricated candles."
              : "Loading market data…"}
          </div>
        ) : (
          <Candles data={cdata} />
        )}
      </div>

      {/* CALL vs PUT volume (real settled trades, last 24h) */}
      <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <div className="nt-legend">
            <span>
              <i className="g" />
              CALL
            </span>
            <span>
              <i className="r" />
              PUT
            </span>
          </div>
          <span className="mono" style={{ fontSize: 10, color: "#8fc3ff" }}>
            {cp
              ? `$${cp.call.toLocaleString()} vs $${cp.put.toLocaleString()} · ${cp.trades} trades`
              : "no trades (24h)"}
          </span>
        </div>
        <div style={{ height: 90 }}>
          {cp && (cp.call > 0 || cp.put > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={[{ name: market.symbol, call: cp.call, put: cp.put }]}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="rgba(148,197,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#4a5870", fontSize: 9 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#4a5870", fontSize: 9 }}
                  width={40}
                  tickFormatter={(n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0e1520",
                    border: "1px solid rgba(0,242,254,0.2)",
                    borderRadius: 10,
                    fontSize: 11,
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Bar dataKey="call" name="CALL" fill="#10b981" radius={[2, 2, 0, 0]} barSize={40} />
                <Bar dataKey="put" name="PUT" fill="#f43f5e" radius={[0, 0, 2, 2]} barSize={40} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div
              style={{
                height: "100%",
                display: "grid",
                placeItems: "center",
                color: "#5b6a85",
                fontSize: 11,
              }}
            >
              No CALL/PUT volume for this market in the last 24 hours.
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
