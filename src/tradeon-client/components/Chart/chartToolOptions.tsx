/**
 * chartToolOptions — the chart-style and drawing-tool catalogues shared by the
 * two chart toolbars: the terminal's controls (rail / floating bar) and the
 * chart page's floating tool column. Both open the SAME pop-up window
 * (`ChartToolPopup`), so the option lists live here once and cannot drift.
 */
import type { ReactNode } from "react";
import type { ToolSection } from "./ChartToolPopup";

/** Series styles the native canvas engine can actually paint. */
export type ChartType = "candles" | "bars" | "line";

export const CHART_TYPE_OPTIONS: { id: ChartType; label: string; path: string }[] = [
  {
    id: "candles",
    label: "Candles",
    path: "M7 4v3M7 17v3M5 7h4v10H5zM17 3v2M17 19v2M15 5h4v14h-4z",
  },
  {
    id: "bars",
    label: "Bars",
    path: "M6 5v14M6 8h4M6 15h4M13 4v16M13 7h4M13 16h4M20 6v12M20 9h2M20 15h2",
  },
  { id: "line", label: "Line", path: "M4 17l3-1 3-5 3 3 4-6 3-2" },
];

/** The one 16px stroke icon the pop-up's option grid uses. */
export function toolIcon(path: string): ReactNode {
  return (
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
      <path d={path} />
    </svg>
  );
}

/* ── Drawing tools, grouped exactly like a tier-1 platform's drawer ── */
export const DRAW_SECTIONS: ToolSection[] = [
  {
    title: "Lines",
    options: [
      { id: "trend", label: "Trend line", icon: toolIcon("M4 20L20 4") },
      { id: "horizontal", label: "Horizontal line", icon: toolIcon("M3 12h18") },
      { id: "vertical", label: "Vertical line", icon: toolIcon("M12 3v18") },
      { id: "ray", label: "Ray", icon: toolIcon("M4 20L20 8M20 8h-5M20 8v5") },
    ],
  },
  {
    title: "Shapes",
    options: [
      { id: "rectangle", label: "Rectangle", icon: toolIcon("M4 5h16v14H4z") },
      { id: "triangle", label: "Triangle", icon: toolIcon("M12 4l8 16H4z") },
      {
        id: "ellipse",
        label: "Ellipse",
        icon: toolIcon("M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z"),
      },
    ],
  },
  {
    title: "Annotations",
    options: [
      { id: "text", label: "Text note", icon: toolIcon("M5 6h14M12 6v12") },
      { id: "arrow", label: "Arrow marker", icon: toolIcon("M5 19L19 5M19 5h-6M19 5v6") },
    ],
  },
];
