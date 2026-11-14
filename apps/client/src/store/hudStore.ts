import { create } from 'zustand';
import type { RacePhase, WeaponId } from '@highway-rush/shared';

export interface HudRacer {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  place: number;
  progress: number;
  health: number;
  gap: number;
  crashed: boolean;
  finished: boolean;
  weapon: WeaponId | null;
}

export interface HudCombat {
  /** 0 = just used, 1 = ready. */
  ready: { punch: number; kick: number; weapon: number };
  weapon: WeaponId | null;
  weaponUses: number;
  weaponMaxUses: number;
  blocking: boolean;
  staggered: boolean;
  /** Name of the rival currently within reach of your best available attack. */
  target: string | null;
  hitsLanded: number;
  knockouts: number;
}

export interface HudSnapshot {
  phase: RacePhase;
  countdown: number;
  time: number;
  speedKmh: number;
  rpm: number;
  gear: number;
  health: number;
  maxHealth: number;
  nitro: number;
  nitroMax: number;
  nitroActive: boolean;
  place: number;
  racerCount: number;
  distance: number;
  raceLength: number;
  score: number;
  combo: number;
  comboTimer: number;
  crashed: boolean;
  respawnIn: number;
  wheelie: boolean;
  combat: HudCombat;
  racers: HudRacer[];
}

export type NotificationTone = 'good' | 'bad' | 'info' | 'epic';

export interface HudNotification {
  id: number;
  text: string;
  sub?: string;
  tone: NotificationTone;
  createdAt: number;
}

interface HudState {
  snapshot: HudSnapshot | null;
  notifications: HudNotification[];
  damageFlash: number;
  setSnapshot: (s: HudSnapshot) => void;
  notify: (text: string, tone?: NotificationTone, sub?: string) => void;
  flashDamage: () => void;
  prune: (now: number) => void;
  reset: () => void;
}

let nextId = 1;

export const useHud = create<HudState>()((set) => ({
  snapshot: null,
  notifications: [],
  damageFlash: 0,
  setSnapshot: (snapshot) => set({ snapshot }),
  notify: (text, tone = 'info', sub) =>
    set((s) => ({ notifications: [...s.notifications.slice(-2), { id: nextId++, text, sub, tone, createdAt: performance.now() }] })),
  flashDamage: () => set((s) => ({ damageFlash: s.damageFlash + 1 })),
  prune: (now) =>
    set((s) => {
      const kept = s.notifications.filter((n) => now - n.createdAt < 1600);
      return kept.length === s.notifications.length ? s : { notifications: kept };
    }),
  reset: () => set({ snapshot: null, notifications: [] }),
}));
