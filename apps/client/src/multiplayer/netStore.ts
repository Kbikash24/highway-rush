import { create } from 'zustand';
import type { LobbyState, RaceResultRow, RaceStartMessage } from '@highway-rush/shared';

export type NetStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  /** Connection dropped; trying to get back into the same room. */
  | 'reconnecting'
  /** Gave up or was removed. See `error`. */
  | 'disconnected';

interface NetState {
  status: NetStatus;
  error: string | null;
  lobby: LobbyState | null;
  youId: string | null;
  /** Round-trip time in ms (smoothed). */
  ping: number;
  raceStart: RaceStartMessage | null;
  results: RaceResultRow[] | null;
  /** True from "race loading" until the first server snapshot arrives. */
  waiting: boolean;
  notice: string | null;
  set: (patch: Partial<Omit<NetState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const initial = {
  status: 'idle' as NetStatus,
  error: null,
  lobby: null,
  youId: null,
  ping: 0,
  raceStart: null,
  results: null,
  waiting: false,
  notice: null,
};

export const useNet = create<NetState>()((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set({ ...initial }),
}));
