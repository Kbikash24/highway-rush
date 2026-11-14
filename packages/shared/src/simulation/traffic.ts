import { LANE_CENTERS, LANE_DIRECTION } from '../constants/game';
import type { TrafficKind, TrafficVehicle } from '../types';
import type { Rng } from './math';
import type { Track } from './track';

interface KindSpec {
  length: number;
  width: number;
  height: number;
  speed: [number, number];
  weight: number;
  colors: number[];
}

export const TRAFFIC_KINDS: Record<TrafficKind, KindSpec> = {
  car: { length: 4.4, width: 1.9, height: 1.5, speed: [17, 26], weight: 0.48, colors: [0xf8fafc, 0x1e3a8a, 0x991b1b, 0x6b7280, 0x0f766e, 0x111827, 0xd4d4d8] },
  sport: { length: 4.3, width: 1.95, height: 1.2, speed: [22, 30], weight: 0.12, colors: [0xfacc15, 0xdc2626, 0x2563eb, 0xf97316] },
  van: { length: 5.2, width: 2.1, height: 2.3, speed: [15, 22], weight: 0.18, colors: [0xf1f5f9, 0x94a3b8, 0x854d0e, 0x166534] },
  bus: { length: 11.5, width: 2.6, height: 3.2, speed: [13, 19], weight: 0.08, colors: [0xf59e0b, 0x0369a1, 0xb91c1c] },
  truck: { length: 12.5, width: 2.6, height: 3.6, speed: [12, 18], weight: 0.14, colors: [0x7c2d12, 0x1d4ed8, 0x3f6212, 0xe5e7eb] },
};

const KIND_ORDER: TrafficKind[] = ['car', 'sport', 'van', 'bus', 'truck'];
const SPAWN_GAP = 30;
const LANE_CHANGE_SPEED = 2.4;

/**
 * Pooled traffic. Each slot keeps its vehicle kind for its lifetime (renderers can use stable
 * instanced meshes) and is recycled ahead of the racers once it falls out of the active window.
 */
export class TrafficSystem {
  readonly vehicles: TrafficVehicle[] = [];
  private readonly rng: Rng;
  private readonly track: Track;

  constructor(count: number, rng: Rng, track: Track) {
    this.rng = rng;
    this.track = track;
    for (let i = 0; i < count; i++) {
      const kind = this.pickKind();
      const spec = TRAFFIC_KINDS[kind];
      this.vehicles.push({
        id: i,
        kind,
        s: 0,
        d: 0,
        prevS: 0,
        prevD: 0,
        lane: 0,
        targetLane: 0,
        speed: 0,
        baseSpeed: 0,
        dir: 1,
        length: spec.length,
        width: spec.width,
        height: spec.height,
        color: spec.colors[0],
        laneChangeCooldown: 0,
        active: false,
        serial: 0,
      });
    }
  }

  private pickKind(): TrafficKind {
    let r = this.rng.next();
    for (const k of KIND_ORDER) {
      r -= TRAFFIC_KINDS[k].weight;
      if (r <= 0) return k;
    }
    return 'car';
  }

  /** Spread vehicles over the initial window, keeping the starting grid clear. */
  init(windowStart: number, windowEnd: number) {
    for (const v of this.vehicles) {
      for (let attempt = 0; attempt < 12; attempt++) {
        if (this.trySpawn(v, this.rng.range(windowStart, windowEnd))) break;
      }
    }
  }

  private laneIsClear(lane: number, s: number, gap: number, self: TrafficVehicle): boolean {
    for (const o of this.vehicles) {
      if (o === self || !o.active) continue;
      if ((o.lane === lane || o.targetLane === lane) && Math.abs(o.s - s) < gap + (o.length + self.length) / 2) return false;
    }
    return true;
  }

  private trySpawn(v: TrafficVehicle, s: number): boolean {
    if (s > this.track.sMax - 50) return false;
    const lane = this.rng.int(0, 3);
    if (!this.laneIsClear(lane, s, SPAWN_GAP, v)) return false;
    const spec = TRAFFIC_KINDS[v.kind];
    v.active = true;
    v.lane = lane;
    v.targetLane = lane;
    v.dir = LANE_DIRECTION[lane];
    v.s = s;
    v.d = LANE_CENTERS[lane];
    v.prevS = v.s;
    v.prevD = v.d;
    v.baseSpeed = this.rng.range(spec.speed[0], spec.speed[1]);
    v.speed = v.baseSpeed;
    v.color = this.rng.pick(spec.colors);
    v.laneChangeCooldown = this.rng.range(2, 6);
    v.serial++;
    return true;
  }

  /** Finds the nearest vehicle ahead (in travel direction) occupying `lane`. */
  private leaderIn(v: TrafficVehicle, lane: number): { gap: number; leader: TrafficVehicle | null } {
    let best = Infinity;
    let leader: TrafficVehicle | null = null;
    for (const o of this.vehicles) {
      if (o === v || !o.active || o.dir !== v.dir) continue;
      if (o.lane !== lane && o.targetLane !== lane) continue;
      const gap = (o.s - v.s) * v.dir - (o.length + v.length) / 2;
      if (gap > -1 && gap < best) {
        best = gap;
        leader = o;
      }
    }
    return { gap: best, leader };
  }

  update(dt: number, focusMin: number, focusMax: number) {
    for (const v of this.vehicles) {
      v.prevS = v.s;
      v.prevD = v.d;
      if (!v.active) {
        this.trySpawn(v, this.rng.range(focusMax + 600, focusMax + 1000));
        continue;
      }

      const { gap, leader } = this.leaderIn(v, v.lane);
      let desired = v.baseSpeed;
      if (leader && gap < 28) {
        desired = Math.min(desired, leader.speed - (gap < 10 ? 3 : 0));
        if (gap < 5) desired = Math.min(desired, leader.speed * 0.6);
      }
      v.speed += Math.max(-8 * dt, Math.min(3 * dt, desired - v.speed));
      v.speed = Math.max(0, v.speed);

      v.laneChangeCooldown -= dt;
      if (v.lane === v.targetLane && v.laneChangeCooldown <= 0 && leader && gap < 35 && leader.baseSpeed < v.baseSpeed - 2) {
        const other = v.dir === 1 ? (v.lane === 2 ? 3 : 2) : v.lane === 0 ? 1 : 0;
        const ahead = this.leaderIn(v, other).gap;
        if (ahead > 30 && this.laneIsClear(other, v.s, 8, v)) {
          v.targetLane = other;
        }
        v.laneChangeCooldown = this.rng.range(3, 7);
      }
      if (v.targetLane !== v.lane) {
        const target = LANE_CENTERS[v.targetLane];
        const step = LANE_CHANGE_SPEED * dt;
        if (Math.abs(target - v.d) <= step) {
          v.d = target;
          v.lane = v.targetLane;
        } else {
          v.d += Math.sign(target - v.d) * step;
        }
      }

      v.s += v.speed * v.dir * dt;

      if (v.s < focusMin - 150 || v.s > focusMax + 1100 || v.s > this.track.sMax - 20) {
        v.active = false;
        this.trySpawn(v, this.rng.range(focusMax + 600, focusMax + 1000));
      }
    }
  }
}
