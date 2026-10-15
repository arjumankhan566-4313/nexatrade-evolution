/**
 * ChartTools — the floating chart tool column pinned to the bottom-left of the
 * chart area (the chart page): drawing tools, the timeframe selector and the
 * chart-type selector, exactly like a tier-1 platform's tool column.
 *
 * The drawing-tools and chart-type buttons open the SAME pop-up WINDOW the
 * terminal's controls use (`ChartToolPopup` — the market catalogue's system):
 * a titled card with one section per group of options, click-outside/Escape to
 * close, anchored beside the column. Timeframe keeps its compact menu.
 */
import { useState } from "react";
import ChartToolPopup from "./ChartToolPopup";
import { CHART_TYPE_OPTIONS, DRAW_SECTIONS, toolIcon, type ChartType } from "./chartToolOptions";

// Existing callers import the type from this module; keep the path working.
export type { ChartType };

/** Only timeframes the OTC backend can build (server OTC_CANDLE_TIMEFRAMES). */
const TIMEFRAMES = ["5s", "15s", "30s", "1m", "5m", "15m", "1h"];

interface Props {
  timeframe: string;
  onTimeframeChange: (t: string) => void;
  chartType: ChartType;
  onChartTypeChange: (t: ChartType) => void;
}

export default function ChartTools({
  timeframe,
  onTimeframeChange,
  chartType,
  onChartTypeChange,
}: Props) {
  /** Compact timeframe menu — the tool windows are separate. */
  const [tfOpen, setTfOpen] = useState(false);
  const [popup, setPopup] = useState<"type" | "draw" | null>(null);
  /** Chosen drawing tool (the canvas painter picks this up). */
  const [drawTool, setDrawTool] = useState<string | null>("trend");
  const activeType = CHART_TYPE_OPTIONS.find((t) => t.id === chartType) ?? CHART_TYPE_OPTIONS[0];

  return (
    <div className="chtools">
      <button
        type="button"
        className={`chtools__btn ${popup === "draw" ? "is-open" : ""}`}
        aria-label="Drawing tools"
        title="Drawing tools"
        aria-haspopup="dialog"
        aria-expanded={popup === "draw"}
        onClick={() => {
          setPopup(popup === "draw" ? null : "draw");
          setTfOpen(false);
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" />
        </svg>
      </button>

      <button
        type="button"
        className={`chtools__btn chtools__btn--tf ${tfOpen ? "is-open" : ""}`}
        aria-label={`Timeframe ${timeframe}`}
        title="Timeframe"
        aria-expanded={tfOpen}
        onClick={() => {
          setTfOpen((v) => !v);
          setPopup(null);
        }}
      >
        {timeframe}
      </button>

      <button
        type="button"
        className={`chtools__btn ${popup === "type" ? "is-open" : ""}`}
        aria-label={`Chart type ${activeType.label}`}
        title="Chart type"
        aria-haspopup="dialog"
        aria-expanded={popup === "type"}
        onClick={() => {
          setPopup(popup === "type" ? null : "type");
          setTfOpen(false);
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={activeType.path} />
        </svg>
      </button>

      {tfOpen && (
        <div className="chtools__pop chtools__pop--tf" role="menu" aria-label="Timeframe">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              type="button"
              role="menuitemradio"
              aria-checked={t === timeframe}
              className={`chtools__opt ${t === timeframe ? "is-active" : ""}`}
              onClick={() => {
                onTimeframeChange(t);
                setTfOpen(false);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {popup === "type" && (
        <ChartToolPopup
          title="Chart type"
          hint={activeType.label}
          anchor="floating"
          sections={[
            {
              title: "Style",
              options: CHART_TYPE_OPTIONS.map((t) => ({
                id: t.id,
                label: t.label,
                icon: toolIcon(t.path),
              })),
            },
          ]}
          activeId={chartType}
          onPick={(id) => {
            onChartTypeChange(id as ChartType);
            setPopup(null);
          }}
          onClose={() => setPopup(null)}
        />
      )}

      {popup === "draw" && (
        <ChartToolPopup
          title="Drawing tools"
          hint="Pick a tool, then draw on the chart"
          anchor="floating"
          sections={DRAW_SECTIONS}
          activeId={drawTool}
          onPick={(id) => setDrawTool(id)}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
