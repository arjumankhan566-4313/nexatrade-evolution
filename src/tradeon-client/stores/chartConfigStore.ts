/**
 * chartConfigStore — admin-controllable chart UI configuration.
 *
 * The countdown timer's background color lives here so an admin panel (or any
 * settings surface) can recolor it at runtime; the canvas draw path and the
 * DOM pill both read from this single source. Default is pure white.
 *
 * The value is persisted server-side (system_settings.chart_timer_bg) and
 * reaches every open terminal two ways:
 *  1. loadFromServer() — fetched once when a chart mounts;
 *  2. the realtime `rt:settings` broadcast — an admin save lands in ~1s
 *     without a reload.
 */
import { create } from "zustand";
import { socket } from "../lib/socket";

interface ChartConfigState {
  /** Countdown pill background (any #rgb/#rrggbb). Default pure white. */
  timerBgColor: string;
  setTimerBgColor: (color: string) => void;
  /** Fetch the admin-chosen color once and subscribe to live updates. */
  loadFromServer: () => Promise<void>;
}

let realtimeBound = false;

function bindRealtime(set: (partial: Partial<ChartConfigState>) => void) {
  if (realtimeBound) return;
  realtimeBound = true;
  socket.emit("join:rt", "settings");
  socket.on("rt:settings", (event: { payload?: { settings?: { chart_timer_bg?: string } } }) => {
    const color = event?.payload?.settings?.chart_timer_bg;
    if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
      set({ timerBgColor: color });
    }
  });
}

export const useChartConfigStore = create<ChartConfigState>((set) => ({
  timerBgColor: "#FFFFFF",
  setTimerBgColor: (color) => set({ timerBgColor: color }),
  loadFromServer: async () => {
    bindRealtime(set);
    try {
      const res = await fetch("/api/market/otc/config", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { chartTimerBg?: string };
      if (typeof data.chartTimerBg === "string" && /^#[0-9a-fA-F]{6}$/.test(data.chartTimerBg)) {
        set({ timerBgColor: data.chartTimerBg });
      }
    } catch {
      /* keep the default white when the config endpoint is unreachable */
    }
  },
}));
