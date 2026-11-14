import type { BikeId, BikeInput, RaceEvent } from '../types';
import type { RacerConfig } from '../simulation/raceSimulation';
import type { MapId } from '../constants/maps';
import type { TrafficDensity } from '../constants/game';
import type { RaceResultRow } from '../simulation/results';

export const PROTOCOL_VERSION = 1;
export const ROOM_NAME = 'race';

/** Client -> server message types. */
export const C2S = {
  ready: 'ready',
  bike: 'bike',
  settings: 'settings',
  loaded: 'loaded',
  input: 'input',
  ping: 'ping',
  again: 'again',
  /** Ask the server to (re)send the current lobby and, if a race is live, the race config. */
  sync: 'sync',
} as const;

/** Server -> client message types. */
export const S2C = {
  lobby: 'lobby',
  raceStart: 'raceStart',
  snapshot: 'snap',
  results: 'results',
  pong: 'pong',
  notice: 'notice',
} as const;

export const NET = {
  /** Server snapshots per second. */
  snapshotRate: 20,
  /** Client sends this many input ticks per message. */
  inputBatchTicks: 2,
  /** Remote entities are rendered this far in the past (s) so there are always two snapshots to blend. */
  interpDelay: 0.11,
  maxInputsPerMessage: 8,
  /** Maximum queued inputs per player before the oldest are dropped. */
  maxInputQueue: 12,
  minPlayers: 2,
  maxPlayers: 4,
  lobbyCountdown: 3,
  loadTimeout: 15,
  reconnectWindowRace: 25,
  /** After the first human finishes the rest get this long to finish. */
  finishGrace: 30,
  maxRaceSeconds: 600,
  roomCodeLength: 5,
} as const;

export type RoomPhase = 'lobby' | 'loading' | 'racing' | 'results';

export interface LobbyPlayer {
  id: string;
  name: string;
  bikeId: BikeId;
  ready: boolean;
  connected: boolean;
}

export interface LobbyState {
  code: string;
  isPrivate: boolean;
  phase: RoomPhase;
  hostId: string;
  mapId: MapId;
  trafficDensity: TrafficDensity;
  /** Host option: fill empty grid slots with clearly-labelled AI riders. */
  fillWithBots: boolean;
  minPlayers: number;
  maxPlayers: number;
  players: LobbyPlayer[];
  /** Seconds until the race loads, or null when waiting for players. */
  startingIn: number | null;
}

export interface NetRaceConfig {
  mapId: MapId;
  seed: number;
  trafficCount: number;
  countdownSeconds: number;
  /** Server-chosen override of the map's race length (m); used for short test races. */
  raceLength?: number;
  racers: RacerConfig[];
}

export interface RaceStartMessage {
  config: NetRaceConfig;
  youId: string;
}

export interface InputMessage {
  /** Sequence number of the first input in `i`. */
  s: number;
  i: number[];
}

export interface SettingsMessage {
  mapId?: MapId;
  trafficDensity?: TrafficDensity;
  fillWithBots?: boolean;
}

export interface NoticeMessage {
  text: string;
}

export interface ResultsMessage {
  rows: RaceResultRow[];
}

export type { RaceEvent };

// ---------------------------------------------------------------------------------------------
// Input packing: one integer per simulation tick. Low byte = flags, next byte = steer + 127.
// ---------------------------------------------------------------------------------------------

const FLAG = { throttle: 1, brake: 2, nitro: 4, wheelie: 8, punch: 16, kick: 32, weapon: 64, block: 128 } as const;

export function packInput(i: BikeInput): number {
  const steer = Math.max(-127, Math.min(127, Math.round(i.steer * 127)));
  let flags = 0;
  if (i.throttle > 0.5) flags |= FLAG.throttle;
  if (i.brake > 0.5) flags |= FLAG.brake;
  if (i.nitro) flags |= FLAG.nitro;
  if (i.wheelie) flags |= FLAG.wheelie;
  if (i.punch) flags |= FLAG.punch;
  if (i.kick) flags |= FLAG.kick;
  if (i.weapon) flags |= FLAG.weapon;
  if (i.block) flags |= FLAG.block;
  return flags | ((steer + 127) << 8);
}

/** Returns null for anything that isn't a well-formed packed input. */
export function unpackInput(n: unknown): BikeInput | null {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 0xfefff) return null;
  const steerByte = n >> 8;
  if (steerByte > 254) return null;
  const f = n & 0xff;
  return {
    throttle: f & FLAG.throttle ? 1 : 0,
    brake: f & FLAG.brake ? 1 : 0,
    steer: (steerByte - 127) / 127,
    nitro: (f & FLAG.nitro) !== 0,
    wheelie: (f & FLAG.wheelie) !== 0,
    punch: (f & FLAG.punch) !== 0,
    kick: (f & FLAG.kick) !== 0,
    weapon: (f & FLAG.weapon) !== 0,
    block: (f & FLAG.block) !== 0,
  };
}

/** Strict structural validation of an input message payload. */
export function parseInputMessage(msg: unknown): { s: number; inputs: BikeInput[] } | null {
  if (typeof msg !== 'object' || msg === null) return null;
  const { s, i } = msg as Partial<InputMessage>;
  if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 2 ** 31) return null;
  if (!Array.isArray(i) || i.length === 0 || i.length > NET.maxInputsPerMessage) return null;
  const inputs: BikeInput[] = [];
  for (const n of i) {
    const input = unpackInput(n);
    if (!input) return null;
    inputs.push(input);
  }
  return { s, inputs };
}

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== NET.roomCodeLength) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}
