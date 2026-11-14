import { LANE_DIRECTION } from '../constants/game';
import type { AttackKind, PickupState, RaceEvent, RacerState, TrafficVehicle, WeaponId } from '../types';
import type { RaceSimulation } from '../simulation/raceSimulation';

/**
 * Compact binary-friendly snapshot format. Every value is a small integer (fixed-point), which msgpack
 * encodes in 1-3 bytes. Racers are listed in `sim.racers` order, so no ids are sent per tick.
 */
export interface NetSnapshot {
  /** Server simulation tick. */
  t: number;
  /** 0 countdown, 1 racing, 2 finished. */
  ph: number;
  /** Countdown seconds x100. */
  cd: number;
  /** Race time ms. */
  tm: number;
  /** Last input sequence number the server has applied for the recipient. */
  a: number;
  r: number[][];
  /** Traffic: [id, s*100, d*100, speed*100, lane | targetLane << 2, color]. */
  v: number[][];
  /** Active pickup bitmask words (24 bits each; bit set = active). */
  p: number[];
  e: RaceEvent[];
}

const PHASES = ['countdown', 'racing', 'finished'] as const;
const ATTACKS: Array<AttackKind | null> = [null, 'punch', 'kick', 'weapon'];
const WEAPONS: Array<WeaponId | null> = [null, 'bat', 'chain'];

export const phaseToCode = (p: RaceSimulation['phase']) => PHASES.indexOf(p);
export const codeToPhase = (c: number) => PHASES[c] ?? 'countdown';

interface Field {
  scale: number;
  /** Blend between snapshots when interpolating remote riders. */
  lerp: boolean;
  get: (r: RacerState) => number;
  set: (r: RacerState, v: number) => void;
}

const field = (scale: number, lerp: boolean, get: Field['get'], set: Field['set']): Field => ({ scale, lerp, get, set });

const FLAGS = { nitroActive: 1, offroad: 2, crashed: 4, finished: 8, braking: 16, blocking: 32, isHuman: 64, attackResolved: 128 } as const;

export const RACER_FIELDS: Field[] = [
  field(100, true, (r) => r.s, (r, v) => (r.s = v)),
  field(100, true, (r) => r.d, (r, v) => (r.d = v)),
  field(100, true, (r) => r.v, (r, v) => (r.v = v)),
  field(1000, true, (r) => r.yaw, (r, v) => (r.yaw = v)),
  field(1000, true, (r) => r.lean, (r, v) => (r.lean = v)),
  field(100, true, (r) => r.wheelie, (r, v) => (r.wheelie = v)),
  field(100, false, (r) => r.wheelieTime, (r, v) => (r.wheelieTime = v)),
  field(10, true, (r) => r.health, (r, v) => (r.health = v)),
  field(10, true, (r) => r.nitro, (r, v) => (r.nitro = v)),
  field(100, false, (r) => r.crashTimer, (r, v) => (r.crashTimer = v)),
  field(100, false, (r) => r.invulnerable, (r, v) => (r.invulnerable = v)),
  field(1, false, (r) => r.score, (r, v) => (r.score = v)),
  field(1, false, (r) => r.combo, (r, v) => (r.combo = v)),
  field(100, false, (r) => r.comboTimer, (r, v) => (r.comboTimer = v)),
  field(1, false, (r) => r.place, (r, v) => (r.place = v)),
  field(1000, false, (r) => (r.finishTime === null ? -0.001 : r.finishTime), (r, v) => (r.finishTime = v < 0 ? null : v)),
  field(
    1,
    false,
    (r) =>
      (r.nitroActive ? FLAGS.nitroActive : 0) |
      (r.offroad ? FLAGS.offroad : 0) |
      (r.crashed ? FLAGS.crashed : 0) |
      (r.finished ? FLAGS.finished : 0) |
      (r.braking ? FLAGS.braking : 0) |
      (r.combat.blocking ? FLAGS.blocking : 0) |
      (r.isHuman ? FLAGS.isHuman : 0) |
      (r.combat.attackResolved ? FLAGS.attackResolved : 0),
    (r, v) => {
      r.nitroActive = (v & FLAGS.nitroActive) !== 0;
      r.offroad = (v & FLAGS.offroad) !== 0;
      r.crashed = (v & FLAGS.crashed) !== 0;
      r.finished = (v & FLAGS.finished) !== 0;
      r.braking = (v & FLAGS.braking) !== 0;
      r.combat.blocking = (v & FLAGS.blocking) !== 0;
      r.isHuman = (v & FLAGS.isHuman) !== 0;
      r.combat.attackResolved = (v & FLAGS.attackResolved) !== 0;
    },
  ),
  field(100, false, (r) => r.throttle, (r, v) => (r.throttle = v)),
  field(1, false, (r) => ATTACKS.indexOf(r.combat.attack), (r, v) => (r.combat.attack = ATTACKS[v] ?? null)),
  field(1, false, (r) => WEAPONS.indexOf(r.combat.attackWeapon), (r, v) => (r.combat.attackWeapon = WEAPONS[v] ?? null)),
  field(1000, false, (r) => r.combat.attackTimer, (r, v) => (r.combat.attackTimer = v)),
  field(1, false, (r) => r.combat.attackSide, (r, v) => (r.combat.attackSide = v < 0 ? -1 : 1)),
  field(1, false, (r) => r.combat.attackSeq, (r, v) => (r.combat.attackSeq = v)),
  field(1000, false, (r) => r.combat.cooldowns.punch, (r, v) => (r.combat.cooldowns.punch = v)),
  field(1000, false, (r) => r.combat.cooldowns.kick, (r, v) => (r.combat.cooldowns.kick = v)),
  field(1000, false, (r) => r.combat.cooldowns.weapon, (r, v) => (r.combat.cooldowns.weapon = v)),
  field(1000, false, (r) => r.combat.stagger, (r, v) => (r.combat.stagger = v)),
  field(100, false, (r) => r.combat.knockbackV, (r, v) => (r.combat.knockbackV = v)),
  field(100, false, (r) => r.combat.shield, (r, v) => (r.combat.shield = v)),
  field(1, false, (r) => WEAPONS.indexOf(r.combat.weapon), (r, v) => (r.combat.weapon = WEAPONS[v] ?? null)),
  field(1, false, (r) => r.combat.weaponUses, (r, v) => (r.combat.weaponUses = v)),
  field(1000, false, (r) => r.combat.hitFlash, (r, v) => (r.combat.hitFlash = v)),
  field(1, false, (r) => r.combat.hitsLanded, (r, v) => (r.combat.hitsLanded = v)),
  field(1, false, (r) => r.combat.knockouts, (r, v) => (r.combat.knockouts = v)),
];

export const RACER_FIELD_COUNT = RACER_FIELDS.length;

export function encodeRacer(r: RacerState): number[] {
  return RACER_FIELDS.map((f) => Math.round(f.get(r) * f.scale));
}

export function decodeRacer(values: readonly number[], r: RacerState) {
  for (let i = 0; i < RACER_FIELDS.length; i++) {
    const f = RACER_FIELDS[i];
    f.set(r, (values[i] ?? 0) / f.scale);
  }
}

/** Blends two encoded racers; discrete fields come from `a` (the earlier snapshot). */
export function lerpRacerValues(a: readonly number[], b: readonly number[], t: number): number[] {
  return RACER_FIELDS.map((f, i) => (f.lerp ? a[i] + (b[i] - a[i]) * t : a[i]));
}

export const TRAFFIC_COLS = { id: 0, s: 1, d: 2, speed: 3, lanes: 4, color: 5 } as const;

export function encodeTraffic(vehicles: readonly TrafficVehicle[], minS: number, maxS: number): number[][] {
  const out: number[][] = [];
  for (const v of vehicles) {
    if (!v.active || v.s < minS || v.s > maxS) continue;
    out.push([v.id, Math.round(v.s * 100), Math.round(v.d * 100), Math.round(v.speed * 100), v.lane | (v.targetLane << 2), v.color]);
  }
  return out;
}

/** Applies one traffic row to a vehicle (position/lane state only; kind and size are fixed per slot). */
export function decodeTrafficRow(row: readonly number[], v: TrafficVehicle) {
  v.s = row[TRAFFIC_COLS.s] / 100;
  v.d = row[TRAFFIC_COLS.d] / 100;
  v.speed = row[TRAFFIC_COLS.speed] / 100;
  v.lane = row[TRAFFIC_COLS.lanes] & 3;
  v.targetLane = (row[TRAFFIC_COLS.lanes] >> 2) & 3;
  v.dir = LANE_DIRECTION[v.lane];
  v.color = row[TRAFFIC_COLS.color];
  v.active = true;
}

export function encodePickups(pickups: readonly PickupState[]): number[] {
  const words: number[] = [];
  pickups.forEach((p, i) => {
    const w = Math.floor(i / 24);
    while (words.length <= w) words.push(0);
    if (p.active) words[w] |= 1 << i % 24;
  });
  return words;
}

export function decodePickups(words: readonly number[], pickups: PickupState[]) {
  pickups.forEach((p, i) => {
    p.active = ((words[Math.floor(i / 24)] ?? 0) & (1 << i % 24)) !== 0;
  });
}

export const SNAPSHOT_TRAFFIC_BEHIND = 150;
export const SNAPSHOT_TRAFFIC_AHEAD = 800;

/** Builds the per-recipient snapshot. `focusS` is the recipient's distance, used to cull far traffic. */
export function encodeSnapshot(sim: RaceSimulation, ack: number, events: RaceEvent[], focusS: number): NetSnapshot {
  return {
    t: sim.tick,
    ph: phaseToCode(sim.phase),
    cd: Math.round(sim.countdown * 100),
    tm: Math.round(sim.time * 1000),
    a: ack,
    r: sim.racers.map(encodeRacer),
    v: encodeTraffic(sim.traffic.vehicles, focusS - SNAPSHOT_TRAFFIC_BEHIND, focusS + SNAPSHOT_TRAFFIC_AHEAD),
    p: encodePickups(sim.pickups),
    e: events,
  };
}

/** Structural sanity check for untrusted/corrupt server data on the client. */
export function isValidSnapshot(x: unknown, racerCount: number): x is NetSnapshot {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Partial<NetSnapshot>;
  return (
    typeof s.t === 'number' &&
    typeof s.ph === 'number' &&
    typeof s.cd === 'number' &&
    typeof s.tm === 'number' &&
    typeof s.a === 'number' &&
    Array.isArray(s.r) &&
    s.r.length === racerCount &&
    s.r.every((row) => Array.isArray(row) && row.length === RACER_FIELD_COUNT) &&
    Array.isArray(s.v) &&
    Array.isArray(s.p) &&
    Array.isArray(s.e)
  );
}
