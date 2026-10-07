import { create } from 'zustand';

export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface DemoTick {
  seq: number;
  symbol: string;
  price: number;
  at: string;
}

interface ConnectionState {
  socketStatus: SocketStatus;
  apiHealth: string | null;
  lastTick: DemoTick | null;
  setSocketStatus: (status: SocketStatus) => void;
  setApiHealth: (health: string | null) => void;
  setLastTick: (tick: DemoTick) => void;
}

// Module 1 store: tracks the REST health probe and the Socket.io realtime
// pipe. Later modules add market, auth and trading slices alongside this.
export const useConnectionStore = create<ConnectionState>((set) => ({
  socketStatus: 'idle',
  apiHealth: null,
  lastTick: null,
  setSocketStatus: (socketStatus) => set({ socketStatus }),
  setApiHealth: (apiHealth) => set({ apiHealth }),
  setLastTick: (lastTick) => set({ lastTick }),
}));
