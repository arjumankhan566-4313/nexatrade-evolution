/**
 * Account mode store — tracks whether the user is trading with their REAL
 * or DEMO balance. Ported from legacy AccountModeProvider context.
 */
import { create } from 'zustand';

export type AccountMode = 'real' | 'demo';

interface AccountModeState {
  mode: AccountMode;
  setMode: (m: AccountMode) => void;
}

export const useAccountModeStore = create<AccountModeState>((set) => ({
  mode: 'demo',
  setMode: (mode) => set({ mode }),
}));
