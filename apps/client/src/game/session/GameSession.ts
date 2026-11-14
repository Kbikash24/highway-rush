import {
  ATTACKS,
  BIKES,
  FIXED_DT,
  RaceSimulation,
  TRACKS,
  TRAFFIC_DENSITY,
  WEAPONS,
  findTarget,
  type BikeId,
  type MapId,
  type RaceEvent,
  type RacerConfig,
  type RacerState,
} from '@highway-rush/shared';
import { audio } from '../audio/AudioEngine';
import { input } from '../input/InputManager';
import { useHud, type HudSnapshot } from '../../store/hudStore';
import type { RaceResults } from '../../store/gameStore';
import type { TrafficDensity } from '@highway-rush/shared';

export const PLAYER_ID = 'player';

const RIVALS: Array<Omit<RacerConfig, 'isHuman'>> = [
  { id: 'rival-1', name: 'Nova', bikeId: 'blade', color: '#f97316', skill: 0.93, aggression: 0.55 },
  { id: 'rival-2', name: 'Diesel', bikeId: 'thunder', color: '#8b5cf6', skill: 0.99, aggression: 0.85 },
  { id: 'rival-3', name: 'Kestrel', bikeId: 'viper', color: '#14b8a6', skill: 0.96, aggression: 0.4 },
];

export interface SessionOptions {
  mapId: MapId;
  bikeId: BikeId;
  playerName: string;
  trafficDensity: TrafficDensity;
}

type EventListener = (e: RaceEvent) => void;

const MAX_STEPS_PER_FRAME = 8;

/**
 * Client-side owner of a local race. Runs the shared deterministic simulation at a fixed tick and
 * exposes interpolation alpha for rendering. In online modes the server will own the simulation.
 */
export class GameSession {
  readonly sim: RaceSimulation;
  readonly playerId = PLAYER_ID;
  alpha = 0;
  paused = false;
  shake = 0;
  /** False until the scene has rendered; the countdown must not run during scene build / shader compile. */
  ready = false;
  private warmupFrames = 0;
  private warmupTime = 0;
  private accumulator = 0;
  private hudTimer = 0;
  private listeners = new Set<EventListener>();
  private scrapeLevel = 0;
  private finishedHandled = false;
  onFinished: ((results: RaceResults) => void) | null = null;
  onReady: (() => void) | null = null;

  constructor(opts: SessionOptions) {
    const track = TRACKS[opts.mapId];
    if (!track) throw new Error(`Map ${opts.mapId} is not playable yet`);
    this.sim = new RaceSimulation({
      track,
      racers: [
        { id: PLAYER_ID, name: opts.playerName, bikeId: opts.bikeId, isHuman: true, color: BIKES[opts.bikeId].colors.primary },
        ...RIVALS.map((r) => ({ ...r, isHuman: false })),
      ],
      trafficCount: TRAFFIC_DENSITY[opts.trafficDensity],
      seed: (Math.random() * 2 ** 31) | 0,
      countdownSeconds: 3.5,
    });
  }

  get player(): RacerState {
    return this.sim.racers[0];
  }

  subscribe(cb: EventListener) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Advance by real frame time; runs the fixed-step simulation. */
  update(frameDt: number) {
    if (!this.ready) {
      // Wait for a few smooth frames so the first expensive frames don't eat the countdown
      // (with a time cap so slow devices still start).
      this.warmupFrames = frameDt < 0.05 ? this.warmupFrames + 1 : 0;
      this.warmupTime += Math.min(frameDt, 0.5);
      if (this.warmupFrames >= 10 || this.warmupTime > 4) {
        this.ready = true;
        this.onReady?.();
      }
      useHud.getState().setSnapshot(this.snapshot());
      return;
    }
    const dt = Math.min(frameDt, 0.1);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.scrapeLevel = Math.max(0, this.scrapeLevel - dt * 4);
    audio.setScrape(this.paused ? 0 : this.scrapeLevel);
    if (this.paused) {
      audio.updateEngine(0, 0, 0, false, true);
      return;
    }

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.sim.setInput(this.playerId, input.sample(FIXED_DT));
      this.sim.step(FIXED_DT);
      for (const e of this.sim.drainEvents()) this.handleEvent(e);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    this.alpha = this.accumulator / FIXED_DT;

    const p = this.player;
    const { rpm } = this.gearbox(p);
    audio.updateEngine(p.v * 3.6, rpm, p.crashed ? 0 : p.throttle, p.nitroActive, false);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 1 / 20;
      useHud.getState().setSnapshot(this.snapshot());
      useHud.getState().prune(performance.now());
    }

    if (this.sim.phase === 'finished' && !this.finishedHandled) {
      this.finishedHandled = true;
      const results = this.buildResults();
      audio.victory(results.player.place === 1);
      window.setTimeout(() => this.onFinished?.(results), 1800);
    }
  }

  gearbox(r: RacerState) {
    const top = BIKES[r.bikeId].stats.topSpeed * 1.3;
    const gears = 6;
    const ratio = Math.min(0.999, r.v / top);
    const gear = Math.min(gears, Math.floor(Math.pow(ratio, 0.8) * gears) + 1);
    const lo = Math.pow((gear - 1) / gears, 1.25);
    const hi = Math.pow(gear / gears, 1.25);
    const rpm = r.v < 0.5 ? 0.12 + r.throttle * 0.1 : 0.2 + 0.8 * Math.min(1, Math.max(0, (ratio - lo) / (hi - lo)));
    return { gear: r.v < 0.5 ? 0 : gear, rpm };
  }

  private handleEvent(e: RaceEvent) {
    const hud = useHud.getState();
    const mine = 'racerId' in e && e.racerId === this.playerId;
    switch (e.type) {
      case 'countdown':
        audio.countdownBeep(e.value === 0);
        break;
      case 'collision':
        if (mine) {
          audio.crash(e.impact);
          this.shake = Math.min(1.2, this.shake + e.impact / 25);
          hud.flashDamage();
          if (e.impact > 18) hud.notify('HEAVY IMPACT', 'bad', `-${Math.round(e.damage)} HP`);
        }
        break;
      case 'barrier':
        if (mine) {
          this.scrapeLevel = Math.min(0.3, 0.12 + e.impact * 0.02);
          if (e.impact > 4) {
            audio.crash(e.impact);
            this.shake = Math.min(1, this.shake + e.impact / 30);
            hud.flashDamage();
          }
        }
        break;
      case 'nearMiss':
        if (mine) {
          audio.whoosh();
          hud.notify('NEAR MISS', 'good', `+${e.bonus}${e.combo > 1 ? `  x${e.combo}` : ''}`);
        }
        break;
      case 'stunt':
        if (mine) {
          audio.stunt();
          hud.notify(e.label, 'epic', `+${e.points}`);
        }
        break;
      case 'wreck':
        if (mine) {
          audio.wreck();
          this.shake = 1.4;
          hud.flashDamage();
          hud.notify('WRECKED!', 'bad', 'Respawning...');
        }
        break;
      case 'respawn':
        if (mine) hud.notify('BACK IN THE RACE', 'info');
        break;
      case 'nitro':
        if (mine && e.active) audio.nitroIgnite();
        break;
      case 'finish':
        if (mine) hud.notify(e.place === 1 ? 'VICTORY!' : `FINISHED P${e.place}`, e.place === 1 ? 'epic' : 'info');
        break;
      case 'bikeBump':
        if ((e.a === this.playerId || e.b === this.playerId) && e.impact > 4) {
          audio.crash(e.impact * 0.5);
          this.shake = Math.min(1, this.shake + 0.2);
        }
        break;
      case 'attack': {
        if (e.racerId === this.playerId) input.consumeAttack(e.kind);
        const gain = this.proximityGain(e.racerId);
        if (gain > 0) audio.swing(gain * (e.racerId === this.playerId ? 1 : 0.6));
        break;
      }
      case 'attackMiss':
        if (e.racerId === this.playerId) hud.notify('MISS', 'info');
        break;
      case 'hit': {
        const gain = e.attackerId === this.playerId || e.targetId === this.playerId ? 1 : this.proximityGain(e.targetId) * 0.7;
        if (gain > 0) {
          if (e.blocked) audio.block(gain);
          else if (e.kind === 'weapon' && e.weapon) audio.weaponHit(e.weapon, gain);
          else if (e.kind === 'kick') audio.kick(gain);
          else audio.punch(gain);
        }
        if (e.attackerId === this.playerId) {
          const target = this.sim.getRacer(e.targetId);
          hud.notify(e.blocked ? 'BLOCKED' : `${this.attackLabel(e.kind, e.weapon)} HIT`, e.blocked ? 'info' : 'good', `${target?.name ?? ''} -${Math.round(e.damage)}`);
          this.shake = Math.min(1, this.shake + 0.12);
        } else if (e.targetId === this.playerId) {
          const attacker = this.sim.getRacer(e.attackerId);
          this.shake = Math.min(1.2, this.shake + (e.blocked ? 0.15 : 0.45));
          if (!e.blocked) hud.flashDamage();
          hud.notify(e.blocked ? 'BLOCKED!' : `HIT BY ${attacker?.name.toUpperCase() ?? 'RIVAL'}`, e.blocked ? 'good' : 'bad', `-${Math.round(e.damage)} HP`);
        }
        break;
      }
      case 'pickup':
        if (e.racerId === this.playerId) {
          audio.pickup();
          hud.notify(`${WEAPONS[e.weapon].name.toUpperCase()} ACQUIRED`, 'epic', `${WEAPONS[e.weapon].uses} hits · press K`);
        }
        break;
      case 'weaponBreak':
        if (e.racerId === this.playerId) {
          audio.weaponBreak();
          hud.notify(`${WEAPONS[e.weapon].name.toUpperCase()} BROKE`, 'bad');
        }
        break;
      case 'knockout':
        if (e.attackerId === this.playerId) {
          audio.knockout();
          hud.notify('KNOCKOUT!', 'epic', `${this.sim.getRacer(e.targetId)?.name ?? ''} is down`);
        } else if (e.targetId === this.playerId) {
          hud.notify(`TAKEN OUT BY ${this.sim.getRacer(e.attackerId)?.name.toUpperCase() ?? 'RIVAL'}`, 'bad');
        }
        break;
    }
    this.listeners.forEach((cb) => cb(e));
  }

  private attackLabel(kind: 'punch' | 'kick' | 'weapon', weapon: 'bat' | 'chain' | null) {
    if (kind === 'weapon' && weapon) return WEAPONS[weapon].name.toUpperCase();
    return kind.toUpperCase();
  }

  /** 1 near the player, fading to 0 at 60 m so distant AI fights stay quiet. */
  private proximityGain(racerId: string) {
    if (racerId === this.playerId) return 1;
    const r = this.sim.getRacer(racerId);
    if (!r) return 0;
    return Math.max(0, 1 - Math.abs(r.s - this.player.s) / 60);
  }

  private combatSnapshot() {
    const p = this.player;
    const c = p.combat;
    const weaponSpec = c.weapon ? WEAPONS[c.weapon] : null;
    const reach = weaponSpec ?? ATTACKS.kick;
    const target = p.crashed ? null : findTarget(p, this.sim.racers, reach, 0) ?? findTarget(p, this.sim.racers, ATTACKS.punch, 0);
    return {
      ready: {
        punch: 1 - c.cooldowns.punch / ATTACKS.punch.cooldown,
        kick: 1 - c.cooldowns.kick / ATTACKS.kick.cooldown,
        weapon: weaponSpec ? 1 - c.cooldowns.weapon / weaponSpec.cooldown : 0,
      },
      weapon: c.weapon,
      weaponUses: c.weaponUses,
      weaponMaxUses: weaponSpec?.uses ?? 0,
      blocking: c.blocking,
      staggered: c.stagger > 0,
      target: target?.name ?? null,
      hitsLanded: c.hitsLanded,
      knockouts: c.knockouts,
    };
  }

  snapshot(): HudSnapshot {
    const sim = this.sim;
    const p = this.player;
    const stats = BIKES[p.bikeId].stats;
    const { gear, rpm } = this.gearbox(p);
    return {
      phase: sim.phase,
      countdown: sim.countdown,
      time: sim.time,
      speedKmh: p.v * 3.6,
      rpm,
      gear,
      health: Math.max(0, p.health),
      maxHealth: p.maxHealth,
      nitro: p.nitro,
      nitroMax: stats.nitroCapacity,
      nitroActive: p.nitroActive,
      place: p.place,
      racerCount: sim.racers.length,
      distance: Math.max(0, Math.min(p.s, sim.track.raceLength)),
      raceLength: sim.track.raceLength,
      score: p.score,
      combo: p.combo,
      comboTimer: p.comboTimer,
      crashed: p.crashed,
      respawnIn: p.crashTimer,
      wheelie: p.wheelie > 0.75,
      combat: this.combatSnapshot(),
      racers: sim.standings().map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        isPlayer: r.id === this.playerId,
        place: r.place,
        progress: Math.max(0, Math.min(1, r.s / sim.track.raceLength)),
        health: Math.max(0, r.health) / r.maxHealth,
        gap: r.s - p.s,
        crashed: r.crashed,
        finished: r.finished,
        weapon: r.combat.weapon,
      })),
    };
  }

  private buildResults(): RaceResults {
    const sim = this.sim;
    const p = this.player;
    const rows = sim.standings().map((r, i) => {
      const projected = !r.finished;
      const avg = Math.max(20, r.s / Math.max(1, sim.time));
      const time = r.finished ? r.finishTime! : sim.time + Math.max(0, sim.track.raceLength - r.s) / avg;
      return { id: r.id, name: r.name, color: r.color, isHuman: r.isHuman, place: i + 1, time, projected, topSpeedKmh: r.topSpeed * 3.6, wrecks: r.wrecks, knockouts: r.combat.knockouts };
    });
    const placeBonus = [500, 300, 180, 100][p.place - 1] ?? 50;
    const coins = Math.round(placeBonus + p.score * 0.1 + p.nearMisses * 5 + p.combat.knockouts * 75);
    const xp = Math.round(120 + (4 - p.place) * 60 + p.score * 0.05);
    return {
      rows,
      player: {
        place: p.place,
        time: p.finishTime ?? sim.time,
        score: p.score,
        nearMisses: p.nearMisses,
        wrecks: p.wrecks,
        collisions: p.collisions,
        topSpeedKmh: p.topSpeed * 3.6,
        hitsLanded: p.combat.hitsLanded,
        knockouts: p.combat.knockouts,
        coins,
        xp,
      },
    };
  }
}
