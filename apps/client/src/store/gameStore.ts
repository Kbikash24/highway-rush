import { create } from 'zustand';
import type { BikeId, MapId, RaceResultRow } from '@highway-rush/shared';

export type Screen = 'menu' | 'bikeSelect' | 'race' | 'online' | 'lobby';
export type RaceMode = 'solo' | 'online';

export type { RaceResultRow };

export interface RaceResults {
  rows: RaceResultRow[];
  /** Id of the local rider in `rows`. */
  playerId: string;
  online: boolean;
}

interface GameState {
  screen: Screen;
  raceMode: RaceMode;
  selectedBike: BikeId;
  selectedMap: MapId;
  raceId: number;
  paused: boolean;
  settingsOpen: boolean;
  results: RaceResults | null;
  setScreen: (screen: Screen) => void;
  selectBike: (bike: BikeId) => void;
  /** Starts a new solo race. */
  startRace: () => void;
  /** Enters an online race (the server already decided everything about it). */
  startOnlineRace: () => void;
  setPaused: (paused: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setResults: (results: RaceResults | null) => void;
}

export const useGame = create<GameState>()((set) => ({
  screen: 'menu',
  raceMode: 'solo',
  selectedBike: 'viper',
  selectedMap: 'coastal-highway',
  raceId: 0,
  paused: false,
  settingsOpen: false,
  results: null,
  setScreen: (screen) => set({ screen, paused: false }),
  selectBike: (selectedBike) => set({ selectedBike }),
  startRace: () => set((s) => ({ screen: 'race', raceMode: 'solo', raceId: s.raceId + 1, paused: false, results: null })),
  startOnlineRace: () => set((s) => ({ screen: 'race', raceMode: 'online', raceId: s.raceId + 1, paused: false, results: null })),
  setPaused: (paused) => set({ paused }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setResults: (results) => set({ results }),
}));
