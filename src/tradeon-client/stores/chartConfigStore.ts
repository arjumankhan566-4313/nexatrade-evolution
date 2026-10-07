/**
 * chartConfigStore — admin-controllable chart UI configuration.
 *
 * The countdown timer's background color lives here so an admin panel (or any
 * settings surface) can recolor it at runtime; the canvas draw path and the
 * DOM pill both read from this single source. Default is pure white.
 */
import { create } from 'zustand';

interface ChartConfigState {
  /** Countdown pill background (any #rgb/#rrggbb). Default pure white. */
  timerBgColor: string;
  setTimerBgColor: (color: string) => void;
}

export const useChartConfigStore = create<ChartConfigState>((set) => ({
  timerBgColor: '#FFFFFF',
  setTimerBgColor: (color) => set({ timerBgColor: color }),
}));
