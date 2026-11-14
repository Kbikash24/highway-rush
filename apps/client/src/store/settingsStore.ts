import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrafficDensity } from '@highway-rush/shared';

export type Quality = 'low' | 'medium' | 'high';

export interface SettingsState {
  quality: Quality;
  trafficDensity: TrafficDensity;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  showMinimap: boolean;
  touchControls: 'auto' | 'on' | 'off';
  playerName: string;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

const prefersLow = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      quality: prefersLow ? 'low' : 'high',
      trafficDensity: 'medium',
      masterVolume: 0.8,
      sfxVolume: 0.9,
      musicVolume: 0.5,
      showMinimap: true,
      touchControls: 'auto',
      playerName: 'Rider',
      set: (patch) => set(patch),
    }),
    { name: 'highway-rush-settings', version: 1 },
  ),
);

export const QUALITY_PRESETS: Record<Quality, { dpr: [number, number]; shadows: boolean; shadowMapSize: number; bloom: boolean; fogFar: number; props: number }> = {
  low: { dpr: [0.7, 1], shadows: false, shadowMapSize: 512, bloom: false, fogFar: 520, props: 0.5 },
  medium: { dpr: [1, 1.25], shadows: true, shadowMapSize: 1024, bloom: false, fogFar: 680, props: 0.8 },
  high: { dpr: [1, 2], shadows: true, shadowMapSize: 2048, bloom: true, fogFar: 760, props: 1 },
};
