import { useMemo } from "react";
import { motion } from "framer-motion";
import { Globe2 } from "lucide-react";
import { GlassCard, CardHead, LivePill, CountUp } from "./ui";
import { countryMeta } from "./countryMeta";

const W = 400;
const H = 200;
const HUB = { x: 232, y: 92 };

const project = (lat, lng) => ({
  x: ((lng + 180) / 360) * W,
  y: ((90 - lat) / 180) * H,
});

const CONTINENTS = [
  "M60,62 L88,50 L112,58 L126,70 L120,86 L96,92 L78,84 L66,76 Z",
  "M122,98 L150,92 L172,100 L188,114 L176,132 L150,140 L128,132 L120,116 Z",
  "M196,54 L224,44 L250,52 L262,66 L250,80 L228,84 L206,76 L198,66 Z",
  "M240,86 L272,78 L300,88 L318,104 L306,122 L282,126 L258,116 L246,102 Z",
  "M300,58 L340,48 L368,60 L380,78 L360,88 L326,84 L310,72 Z",
  "M360,118 L384,116 L392,132 L380,146 L362,142 Z",
];

export default function WorldHeatmap({ geo }) {
  const countries = useMemo(
    () => geo.map((g) => ({ ...g, ...countryMeta(g.code) })).filter((c) => c.users > 0),
    [geo],
  );
  const total = countries.reduce((s, c) => s + c.users, 0);
  const top = [...countries].sort((a, b) => b.users - a.users).slice(0, 7);
  const maxUsers = Math.max(1, ...countries.map((c) => c.users));

  const arcs = useMemo(
    () =>
      countries.map((c) => {
        const p = project(c.lat, c.lng);
        return {
          ...p,
          ctrl: { x: (p.x + HUB.x) / 2, y: Math.min(p.y, HUB.y) - 34 - (c.users / maxUsers) * 14 },
        };
      }),
    [countries, maxUsers],
  );

  return (
    <div className="nt-row-2b">
      <GlassCard delay={0.18}>
        <CardHead
          eyebrow="Global user traffic"
          title="Live geo-location heatmap"
          sub="Real trader origin by country of registration"
          right={<LivePill />}
        />
        {countries.length === 0 ? (
          <div
            style={{
              height: 300,
              display: "grid",
              placeItems: "center",
              color: "#5b6a85",
              fontSize: 12,
            }}
          >
            No trader countries recorded yet.
          </div>
        ) : (
          <div className="nt-map-wrap">
            <svg
              className="nt-map-svg"
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <radialGradient id="heatGrad">
                  <stop offset="0" stopColor="#00f2fe" stopOpacity="0.85" />
                  <stop offset="0.5" stopColor="#10b981" stopOpacity="0.32" />
                  <stop offset="1" stopColor="#10b981" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="hubGlow">
                  <stop offset="0" stopColor="#00f2fe" stopOpacity="0.9" />
                  <stop offset="1" stopColor="#00f2fe" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#00f2fe" stopOpacity="0.1" />
                  <stop offset="1" stopColor="#00f2fe" stopOpacity="0.9" />
                </linearGradient>
              </defs>

              {Array.from({ length: 9 }, (_, i) => (
                <line
                  key={`v${i}`}
                  className="nt-map-graticule"
                  x1={(i + 1) * 40}
                  y1={0}
                  x2={(i + 1) * 40}
                  y2={H}
                />
              ))}
              {Array.from({ length: 5 }, (_, i) => (
                <line
                  key={`h${i}`}
                  className="nt-map-graticule"
                  x1={0}
                  y1={(i + 1) * 33}
                  x2={W}
                  y2={(i + 1) * 33}
                />
              ))}

              {CONTINENTS.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="rgba(148,197,255,0.035)"
                  stroke="rgba(148,197,255,0.09)"
                  strokeWidth="0.8"
                />
              ))}

              {arcs.map((a, i) => (
                <path
                  key={`arc${i}`}
                  className="nt-arc"
                  d={`M${a.x},${a.y} Q${a.ctrl.x},${a.ctrl.y} ${HUB.x},${HUB.y}`}
                  stroke="url(#arcGrad)"
                  strokeWidth={1.1}
                  strokeDasharray="5 7"
                  style={{
                    animation: "ntArc 2.4s linear infinite",
                    animationDelay: `${i * 0.18}s`,
                  }}
                />
              ))}

              {countries.map((c, i) => {
                const p = project(c.lat, c.lng);
                const r = 8 + (c.users / maxUsers) * 20;
                return (
                  <g key={`heat${i}`}>
                    <circle className="nt-heat" cx={p.x} cy={p.y} r={r} fill="url(#heatGrad)">
                      <animate
                        attributeName="r"
                        values={`${r};${r * 1.18};${r}`}
                        dur="3s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle cx={p.x} cy={p.y} r={2.4} fill="#d7fbff">
                      <animate
                        attributeName="opacity"
                        values="1;0.4;1"
                        dur="1.6s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <text
                      x={p.x}
                      y={p.y - r - 3}
                      textAnchor="middle"
                      fontSize="7"
                      style={{ pointerEvents: "none" }}
                    >
                      {c.flag}
                    </text>
                  </g>
                );
              })}

              <circle cx={HUB.x} cy={HUB.y} r={16} fill="url(#hubGlow)">
                <animate attributeName="r" values="12;19;12" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle
                cx={HUB.x}
                cy={HUB.y}
                r={3.4}
                fill="#04101a"
                stroke="#00f2fe"
                strokeWidth="1.6"
              />
            </svg>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 10,
            color: "#63728a",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingTop: 11,
            marginTop: 2,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Globe2 size={12} /> {countries.length} regions recorded
          </span>
          <span className="mono" style={{ color: "#8fc3ff" }}>
            {total.toLocaleString()} traders
          </span>
        </div>
      </GlassCard>

      <GlassCard delay={0.22}>
        <CardHead
          eyebrow="Geo density"
          title="Top countries by users"
          sub="Registered traders · user density"
          right={<LivePill variant="cyan" />}
        />
        {top.length === 0 ? (
          <div
            style={{
              padding: "40px 0",
              display: "grid",
              placeItems: "center",
              color: "#5b6a85",
              fontSize: 12,
            }}
          >
            No user data available yet.
          </div>
        ) : (
          <div className="nt-country-list">
            {top.map((c, i) => {
              const pct = Math.round((c.users / maxUsers) * 100);
              return (
                <motion.div
                  key={c.code}
                  className="nt-country"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.24 + i * 0.05 }}
                >
                  <span className="nt-flag">{c.flag}</span>
                  <div className="nt-country-name">
                    <b>{c.name || c.code}</b>
                    <div className="nt-bar">
                      <motion.i
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.9, delay: 0.4 + i * 0.06 }}
                      />
                    </div>
                  </div>
                  <div className="nt-country-val">
                    <CountUp value={c.users} />
                    <small>{total ? ((c.users / total) * 100).toFixed(1) : "0.0"}%</small>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
