import { BIKES } from '../constants/bikes';
import { BIKE_SIZE, LANE_CENTERS, PHYSICS, ROAD } from '../constants/game';
import type { TrackDefinition } from '../constants/maps';
import type { BikeId, BikeInput, PickupState, RaceEvent, RacePhase, RacerState } from '../types';
import { COMBAT } from '../constants/combat';
import { computeAIInput } from './ai';
import { sanitizeInput, stepBike } from './bikePhysics';
import { createCombatState, createPickups, resetCombatOnWreck, updateCombat, updatePickups } from './combat';
import { clamp, createRng, type Rng } from './math';
import { Track } from './track';
import { TrafficSystem } from './traffic';

export interface RacerConfig {
  id: string;
  name: string;
  bikeId: BikeId;
  isHuman: boolean;
  color?: string;
  /** AI only: 0.85..1.0 scales top speed. */
  skill?: number;
  /** AI only: 0..1 how eager the rider is to fight. */
  aggression?: number;
}

export interface RaceConfig {
  track: TrackDefinition;
  racers: RacerConfig[];
  trafficCount: number;
  seed: number;
  countdownSeconds?: number;
  /** Weapon pickups along the course (default true). */
  pickups?: boolean;
}

const NEUTRAL: BikeInput = { throttle: 0, brake: 0, steer: 0, nitro: false, wheelie: false, punch: false, kick: false, weapon: false, block: false };
const GRID_LANES = [LANE_CENTERS[2], LANE_CENTERS[3]];

export class RaceSimulation {
  readonly track: Track;
  readonly traffic: TrafficSystem;
  readonly racers: RacerState[];
  readonly pickups: PickupState[];
  phase: RacePhase = 'countdown';
  countdown: number;
  time = 0;
  tick = 0;
  private readonly rng: Rng;
  private readonly inputs = new Map<string, BikeInput>();
  private events: RaceEvent[] = [];
  private nextPlace = 1;
  private readonly passSigns = new Map<string, Map<number, number>>();

  constructor(config: RaceConfig) {
    this.rng = createRng(config.seed);
    this.track = new Track(config.track);
    this.countdown = config.countdownSeconds ?? 3;
    this.racers = config.racers.map((c, i) => this.createRacer(c, i));
    this.traffic = new TrafficSystem(config.trafficCount, this.rng, this.track);
    this.traffic.init(120, 1100);
    this.pickups = config.pickups === false ? [] : createPickups(this.track.raceLength, this.rng);
  }

  private createRacer(c: RacerConfig, index: number): RacerState {
    const bike = BIKES[c.bikeId];
    const s = -Math.floor(index / 2) * 7 - (index % 2) * 3.5;
    const d = GRID_LANES[index % 2];
    const racer: RacerState = {
      id: c.id,
      name: c.name,
      bikeId: c.bikeId,
      isHuman: c.isHuman,
      color: c.color ?? bike.colors.primary,
      s,
      d,
      prevS: s,
      prevD: d,
      v: 0,
      yaw: 0,
      lean: 0,
      wheelie: 0,
      wheelieTime: 0,
      health: PHYSICS.maxHealth,
      maxHealth: PHYSICS.maxHealth,
      nitro: Math.min(PHYSICS.startingNitro, bike.stats.nitroCapacity),
      nitroActive: false,
      offroad: false,
      crashed: false,
      crashTimer: 0,
      invulnerable: 0,
      finished: false,
      finishTime: null,
      place: index + 1,
      score: 0,
      combo: 1,
      comboTimer: 0,
      nearMisses: 0,
      wrecks: 0,
      collisions: 0,
      topSpeed: 0,
      throttle: 0,
      braking: false,
      speedScale: 1,
      combat: createCombatState(),
    };
    if (!c.isHuman) {
      racer.ai = {
        targetD: d,
        decisionTimer: 0,
        skill: c.skill ?? 0.95,
        nitroBias: this.rng.next(),
        aggression: c.aggression ?? 0.6,
        combatTimer: 0,
        threatKey: null,
        blockThreat: false,
      };
    }
    this.passSigns.set(c.id, new Map());
    return racer;
  }

  setInput(racerId: string, input: Partial<BikeInput>) {
    this.inputs.set(racerId, sanitizeInput(input));
  }

  getRacer(id: string): RacerState | undefined {
    return this.racers.find((r) => r.id === id);
  }

  drainEvents(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Finished racers by finish time, then everyone else by distance. */
  standings(): RacerState[] {
    return [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.s - a.s;
    });
  }

  step(dt: number) {
    this.tick++;
    for (const r of this.racers) {
      r.prevS = r.s;
      r.prevD = r.d;
    }

    const humans = this.racers.filter((r) => r.isHuman);
    const focus = humans.length ? humans : this.racers;
    let focusMin = Infinity;
    let focusMax = -Infinity;
    for (const r of focus) {
      focusMin = Math.min(focusMin, r.s);
      focusMax = Math.max(focusMax, r.s);
    }
    this.traffic.update(dt, focusMin, focusMax);

    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && after > 0) this.events.push({ type: 'countdown', value: after });
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.phase = 'racing';
        this.events.push({ type: 'countdown', value: 0 });
      }
      return;
    }

    this.time += dt;
    const leadHuman = humans.length ? Math.max(...humans.map((h) => h.s)) : null;

    for (const r of this.racers) {
      r.invulnerable = Math.max(0, r.invulnerable - dt);
      r.comboTimer = Math.max(0, r.comboTimer - dt);
      if (r.comboTimer === 0) r.combo = 1;

      if (r.crashed) {
        this.updateCrashed(r, dt);
        continue;
      }

      let input: BikeInput;
      if (r.ai) {
        const rubber = leadHuman === null ? 1 : clamp(1 + (leadHuman - r.s) / 2000, 0.9, 1.1);
        r.speedScale = r.ai.skill * rubber;
        input = computeAIInput(r, { traffic: this.traffic.vehicles, racers: this.racers, pickups: this.pickups, track: this.track, rng: this.rng }, dt);
      } else {
        input = this.inputs.get(r.id) ?? NEUTRAL;
      }
      if (r.finished) input = { ...NEUTRAL, throttle: 0, brake: 0.3, steer: clamp(-r.yaw * 2, -1, 1) };

      stepBike(r, input, BIKES[r.bikeId].stats, this.track, dt, this.events);
      updateCombat(r, input, this.racers, this.time, dt, this.events);
      this.handleTrafficCollisions(r);
      this.detectNearMisses(r);

      if (!r.finished && r.s >= this.track.raceLength) {
        r.finished = true;
        r.finishTime = this.time;
        r.place = this.nextPlace++;
        this.events.push({ type: 'finish', racerId: r.id, place: r.place, time: this.time });
      }
    }

    this.handleBikeBumps();
    updatePickups(this.pickups, this.racers, dt, this.events);
    // Wrecks are resolved after everyone moved so combat damage dealt this tick counts.
    for (const r of this.racers) if (!r.crashed && r.health <= 0) this.wreck(r);

    const standings = this.standings();
    standings.forEach((r, i) => {
      if (!r.finished) r.place = i + 1;
    });

    if (humans.length && humans.every((h) => h.finished)) this.phase = 'finished';
    if (!humans.length && this.racers.every((r) => r.finished)) this.phase = 'finished';
  }

  private updateCrashed(r: RacerState, dt: number) {
    r.crashTimer -= dt;
    r.v *= Math.exp(-2.2 * dt);
    r.s += r.v * dt;
    r.nitroActive = false;
    if (r.crashTimer <= 0) this.respawn(r);
  }

  private wreck(r: RacerState) {
    r.health = 0;
    r.crashed = true;
    r.crashTimer = PHYSICS.crashDuration;
    r.wrecks++;
    r.combo = 1;
    r.wheelie = 0;
    r.wheelieTime = 0;
    if (r.nitroActive) this.events.push({ type: 'nitro', racerId: r.id, active: false });
    r.nitroActive = false;
    this.events.push({ type: 'wreck', racerId: r.id, s: r.s, d: r.d });

    const c = r.combat;
    const attacker = c.lastHitBy ? this.getRacer(c.lastHitBy) : undefined;
    if (attacker && this.time - c.lastHitTime <= COMBAT.knockoutWindow) {
      attacker.combat.knockouts++;
      attacker.score += COMBAT.knockoutScore;
      this.events.push({ type: 'knockout', attackerId: attacker.id, targetId: r.id });
    }
    c.lastHitBy = null;
    resetCombatOnWreck(c);
  }

  private respawn(r: RacerState) {
    let d = ROAD.halfWidth + 0.6;
    for (const lane of [2, 3, 1, 0]) {
      const ld = LANE_CENTERS[lane];
      const blocked = this.traffic.vehicles.some((v) => v.active && Math.abs(v.d - ld) < 2.5 && v.s > r.s - 25 && v.s < r.s + 60);
      if (!blocked) {
        d = ld;
        break;
      }
    }
    r.crashed = false;
    r.health = r.maxHealth;
    r.v = 10;
    r.yaw = 0;
    r.lean = 0;
    r.d = d;
    r.prevD = d;
    r.invulnerable = PHYSICS.respawnInvulnerability;
    r.combat.shield = PHYSICS.respawnInvulnerability;
    this.events.push({ type: 'respawn', racerId: r.id });
  }

  private handleTrafficCollisions(r: RacerState) {
    if (r.invulnerable > 0) return;
    const stats = BIKES[r.bikeId].stats;
    for (const v of this.traffic.vehicles) {
      if (!v.active) continue;
      const ds = v.s - r.s;
      const overlapS = (v.length + BIKE_SIZE.length) / 2 - Math.abs(ds);
      if (overlapS <= 0) continue;
      const dd = v.d - r.d;
      const overlapD = (v.width + BIKE_SIZE.width) / 2 - Math.abs(dd);
      if (overlapD <= 0) continue;

      const vehV = v.speed * v.dir;
      const heavy = v.kind === 'bus' || v.kind === 'truck' ? 1.25 : 1;
      let impact: number;
      if (overlapS < overlapD * 1.6) {
        // Front/rear impact
        if (ds > 0) {
          impact = Math.max(2, r.v * Math.cos(r.yaw) - vehV);
          r.s = v.s - (v.length + BIKE_SIZE.length) / 2 - 0.05;
          r.v = Math.max(0, Math.min(r.v, vehV - 2));
        } else {
          impact = Math.max(2, vehV - r.v);
          r.s = v.s + (v.length + BIKE_SIZE.length) / 2 + 0.05;
          r.v = Math.max(r.v, vehV + 2);
        }
        r.d -= Math.sign(dd || 1) * 0.6;
        r.yaw += (this.rng.next() - 0.5) * 0.4;
      } else {
        // Side swipe
        impact = 3 + Math.abs(r.v * Math.sin(r.yaw)) * 1.5;
        r.d -= Math.sign(dd || 1) * (overlapD + 0.05);
        r.yaw = -r.yaw * 0.5;
        r.v *= 0.92;
      }
      const damage = (impact * 1.25 * heavy) / stats.durability;
      r.health -= damage;
      r.invulnerable = PHYSICS.hitInvulnerability;
      r.collisions++;
      r.combo = 1;
      r.comboTimer = 0;
      this.events.push({ type: 'collision', racerId: r.id, impact, damage, s: r.s, d: r.d, vehicleKind: v.kind });
      return;
    }
  }

  private detectNearMisses(r: RacerState) {
    const signs = this.passSigns.get(r.id)!;
    for (const v of this.traffic.vehicles) {
      const ds = r.s - v.s;
      if (!v.active || Math.abs(ds) > 20) {
        signs.delete(v.id);
        continue;
      }
      const sign = ds >= 0 ? 1 : -1;
      const prev = signs.get(v.id);
      signs.set(v.id, sign);
      if (prev === undefined || prev === sign || r.invulnerable > 0) continue;
      const gap = Math.abs(v.d - r.d) - (v.width + BIKE_SIZE.width) / 2;
      const rel = Math.abs(r.v - v.speed * v.dir);
      if (gap > 0 && gap < PHYSICS.nearMissMaxGap && rel > PHYSICS.nearMissMinRelativeSpeed) {
        const bonus = PHYSICS.nearMissScore * r.combo;
        r.score += bonus;
        r.nearMisses++;
        r.nitro = Math.min(BIKES[r.bikeId].stats.nitroCapacity, r.nitro + PHYSICS.nearMissNitroBonus);
        this.events.push({ type: 'nearMiss', racerId: r.id, bonus, combo: r.combo });
        r.combo = Math.min(PHYSICS.maxCombo, r.combo + 1);
        r.comboTimer = PHYSICS.comboWindow;
      }
    }
  }

  private handleBikeBumps() {
    for (let i = 0; i < this.racers.length; i++) {
      const a = this.racers[i];
      if (a.crashed) continue;
      for (let j = i + 1; j < this.racers.length; j++) {
        const b = this.racers[j];
        if (b.crashed) continue;
        if (Math.abs(a.s - b.s) > BIKE_SIZE.length) continue;
        const dd = b.d - a.d;
        const overlap = BIKE_SIZE.width + 0.2 - Math.abs(dd);
        if (overlap <= 0) continue;
        const push = Math.sign(dd || 1) * (overlap / 2 + 0.02);
        a.d -= push;
        b.d += push;
        const impact = Math.abs(a.v - b.v);
        const avg = (a.v + b.v) / 2;
        a.v = a.v * 0.9 + avg * 0.1;
        b.v = b.v * 0.9 + avg * 0.1;
        this.events.push({ type: 'bikeBump', a: a.id, b: b.id, impact });
      }
    }
  }
}
