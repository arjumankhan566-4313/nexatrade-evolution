/**
 * favoritesStore — the user's starred OTC instruments.
 *
 * Persisted in localStorage so a starred market is still a top-header
 * quick-access tab after a reload. The header renders one tab per favorite
 * (in star order, newest first).
 */
import { create } from "zustand";

const STORAGE_KEY = "nexa.chart.favorites";

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function write(symbols: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    /* private mode / quota — favorites simply stay in memory */
  }
}

interface FavoritesState {
  symbols: string[];
  toggle: (symbol: string) => void;
}

export const useFavoritesStore = create<FavoritesState>((set) => ({
  symbols: read(),
  toggle: (symbol) =>
    set((state) => {
      const symbols = state.symbols.includes(symbol)
        ? state.symbols.filter((s) => s !== symbol)
        : [symbol, ...state.symbols];
      write(symbols);
      return { symbols };
    }),
}));
