import type { BikeDefinition, BikeId } from '../types';

export const BIKES: Record<BikeId, BikeDefinition> = {
  viper: {
    id: 'viper',
    name: 'Viper 600',
    bikeClass: 'Sport',
    description: 'Balanced middleweight. Quick on its feet and forgiving in traffic.',
    stats: { topSpeed: 72, acceleration: 15, handling: 1.1, braking: 26, durability: 1, nitroCapacity: 100 },
    colors: { primary: '#e11d48', secondary: '#111827', accent: '#f59e0b' },
  },
  thunder: {
    id: 'thunder',
    name: 'Thunderhog 1200',
    bikeClass: 'Heavy Cruiser',
    description: 'Armoured brute. Slow to turn, shrugs off hits and carries a big nitro tank.',
    stats: { topSpeed: 66, acceleration: 12.5, handling: 0.85, braking: 22, durability: 1.45, nitroCapacity: 125 },
    colors: { primary: '#0ea5e9', secondary: '#1f2937', accent: '#e5e7eb' },
  },
  blade: {
    id: 'blade',
    name: 'Blade R1K',
    bikeClass: 'Superbike',
    description: 'Raw speed. Highest top end and acceleration, but fragile when things go wrong.',
    stats: { topSpeed: 80, acceleration: 17, handling: 1, braking: 28, durability: 0.8, nitroCapacity: 90 },
    colors: { primary: '#a3e635', secondary: '#0f172a', accent: '#22d3ee' },
  },
};

export const BIKE_LIST: BikeDefinition[] = Object.values(BIKES);

/** Ranges used to normalise stat bars in the UI. */
export const BIKE_STAT_RANGES = {
  topSpeed: [50, 85],
  acceleration: [8, 18],
  handling: [0.6, 1.2],
  braking: [16, 30],
  durability: [0.6, 1.6],
  nitroCapacity: [60, 130],
} as const;
