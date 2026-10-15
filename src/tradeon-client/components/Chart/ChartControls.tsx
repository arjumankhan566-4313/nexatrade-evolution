/**
 * ChartControls — the four chart controls: timeframe, chart type, drawings
 * and fullscreen.
 *
 * They used to float over the bottom-left corner of the plot. The owner wants
 * them out of the chart and onto the site's own left structure, so on desktop
 * and tablet they render at the BOTTOM OF THE TERMINAL'S LEFT RAIL, aligned
 * with the Wallet / History icons (`variant="rail"`). Phones hide that rail
 * entirely, so the very same control set stays reachable there as the legacy
 * floating bar (`variant="floating"`). One component, two placements — the
 * markup below is identical for both.
 *
 * The chart-type and drawings buttons open a real pop-up WINDOW
 * (`ChartToolPopup`), the same system the Markets button uses: a titled card
 * with click-outside/Escape to close and one section per group of options.
 * Timeframe keeps its compact menu; fullscreen acts immediately.
 */
import { useState } from "react";
import ChartToolPopup from "./ChartToolPopup";
import { CHART_TYPE_OPTIONS, DRAW_SECTIONS, toolIcon, type ChartType } from "./chartToolOptions";

/** Timeframes the terminal offers (ported from the legacy floating bar). */
const TIMEFRAMES = ["5s", "10s", "15s", "30s", "1m", "2m", "5m", "15m", "30m", "1h"];

interface Props {
  timeframe: string;
  onTimeframeChange: (t: string) => void;
  onToggleFullscreen: () => void;
  variant: "rail" | "floating";
  /** Painted series — reported by the chart, changed from the pop-up. */
  chartType: ChartType;
  onChartTypeChange: (t: ChartType) => void;
}

export default function ChartControls({
  timeframe,
  onTimeframeChange,
  onToggleFullscreen,
  variant,
  chartType,
  onChartTypeChange,
}: Props) {
  const [tfOpen, setTfOpen] = useState(false);
  /** Which pop-up window is open — only one at a time. */
  const [popup, setPopup] = useState<"type" | "draw" | null>(null);
  /** Chosen drawing tool (the canvas painter picks this up). */
  const [drawTool, setDrawTool] = useState<string | null>("trend");
  const rail = variant === "rail";
  const anchor = rail ? "rail" : "floating";
  const activeType = CHART_TYPE_OPTIONS.find((t) => t.id === chartType) ?? CHART_TYPE_OPTIONS[0];

  return (
    <div className={rail ? "chart-controls chart-controls--rail" : "chart-tools-bar"}>
      {/* Timeframe selector */}
      <div className="chart-tf-control">
        <button
          type="button"
          className={`chart-tf-btn ${tfOpen ? "active" : ""}`}
          onClick={() => {
            setTfOpen((v) => !v);
            setPopup(null);
          }}
          title="Timeframe"
          aria-label={`Timeframe ${timeframe}`}
          aria-expanded={tfOpen}
        >
          {timeframe}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {tfOpen && (
          <div className="chart-tf-menu" role="menu" aria-label="Timeframe">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                role="menuitemradio"
                aria-checked={tf === timeframe}
                className={`chart-tf-opt ${tf === timeframe ? "active" : ""}`}
                onClick={() => {
                  onTimeframeChange(tf);
                  setTfOpen(false);
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart type — opens the chart-style window */}
      <button
        type="button"
        className={`chart-tool-btn ${popup === "type" ? "active" : ""}`}
        title="Chart type"
        aria-label={`Chart type ${activeType.label}`}
        aria-haspopup="dialog"
        aria-expanded={popup === "type"}
        onClick={() => {
          setPopup(popup === "type" ? null : "type");
          setTfOpen(false);
        }}
      >
        <svg
          width="16"
          height="16"
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

      {/* Drawings — opens the drawing-tools window */}
      <button
        type="button"
        className={`chart-tool-btn ${popup === "draw" ? "active" : ""}`}
        title="Drawings"
        aria-label="Drawings"
        aria-haspopup="dialog"
        aria-expanded={popup === "draw"}
        onClick={() => {
          setPopup(popup === "draw" ? null : "draw");
          setTfOpen(false);
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
          <circle cx="11" cy="11" r="2" />
        </svg>
      </button>

      {/* Fullscreen */}
      <button
        type="button"
        className="chart-tool-btn"
        title="Fullscreen"
        aria-label="Fullscreen"
        onClick={onToggleFullscreen}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3" />
        </svg>
      </button>

      {popup === "type" && (
        <ChartToolPopup
          title="Chart type"
          hint={activeType.label}
          anchor={anchor}
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
          anchor={anchor}
          sections={DRAW_SECTIONS}
          activeId={drawTool}
          onPick={(id) => setDrawTool(id)}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
