export interface Wave {
  amplitude: number;
  /** Period in metres. */
  wavelength: number;
  phase: number;
}

export interface TrackDefinition {
  id: MapId;
  name: string;
  /** Distance from start line to finish line (m). */
  raceLength: number;
  /** Lateral (x) undulation of the centerline. */
  curves: Wave[];
  /** Vertical undulation of the centerline. */
  hills: Wave[];
  /** Distance over which curves/hills fade in from a straight start. */
  straightStart: number;
}

export type MapId = 'coastal-highway' | 'desert-run' | 'neon-city' | 'mountain-pass';

export interface MapInfo {
  id: MapId;
  name: string;
  tagline: string;
  playable: boolean;
}

export const COASTAL_HIGHWAY: TrackDefinition = {
  id: 'coastal-highway',
  name: 'Coastal Highway',
  raceLength: 5000,
  curves: [
    { amplitude: 60, wavelength: 1600, phase: 0 },
    { amplitude: 24, wavelength: 700, phase: 1.3 },
    { amplitude: 5, wavelength: 380, phase: 0.4 },
  ],
  hills: [
    { amplitude: 14, wavelength: 1100, phase: 0.5 },
    { amplitude: 5, wavelength: 420, phase: 2 },
  ],
  straightStart: 350,
};

export const MAPS: MapInfo[] = [
  { id: 'coastal-highway', name: 'Coastal Highway', tagline: 'Sunset cliffs above the open sea', playable: true },
  { id: 'desert-run', name: 'Desert Run', tagline: 'Scorched asphalt through the canyon', playable: false },
  { id: 'neon-city', name: 'Neon City', tagline: 'Midnight urban expressway', playable: false },
  { id: 'mountain-pass', name: 'Mountain Pass', tagline: 'Switchbacks above the clouds', playable: false },
];

export const TRACKS: Partial<Record<MapId, TrackDefinition>> = {
  'coastal-highway': COASTAL_HIGHWAY,
};
