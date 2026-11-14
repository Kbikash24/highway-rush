import { create } from 'zustand';
import type { BikeId, MapId } from '@highway-rush/shared';

export type Screen = 'menu' | 'bikeSelect' | 'race';

export interface RaceResultRow {
  id: string;
  name: string;
  color: string;
  isHuman: boolean;
  place: number;
  time: number;
  projected: boolean;
  topSpeedKmh: number;
  wrecks: number;
  knockouts: number;
}

export interface RaceResults {
  rows: RaceResultRow[];
  player: {
    place: number;
    time: number;
    score: number;
    nearMisses: number;
    wrecks: number;
    collisions: number;
    topSpeedKmh: number;
    hitsLanded: number;
    knockouts: number;
    coins: number;
    xp: number;
  };
}

interface GameState {
  screen: Screen;
  selectedBike: BikeId;
  selectedMap: MapId;
  raceId: number;
  paused: boolean;
  settingsOpen: boolean;
  results: RaceResults | null;
  setScreen: (screen: Screen) => void;
  selectBike: (bike: BikeId) => void;
  startRace: () => void;
  setPaused: (paused: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setResults: (results: RaceResults | null) => void;
}

export const useGame = create<GameState>()((set) => ({
  screen: 'menu',
  selectedBike: 'viper',
  selectedMap: 'coastal-highway',
  raceId: 0,
  paused: false,
  settingsOpen: false,
  results: null,
  setScreen: (screen) => set({ screen, paused: false }),
  selectBike: (selectedBike) => set({ selectedBike }),
  startRace: () => set((s) => ({ screen: 'race', raceId: s.raceId + 1, paused: false, results: null })),
  setPaused: (paused) => set({ paused }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setResults: (results) => set({ results }),
}));
