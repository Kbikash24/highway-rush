import { describe, expect, it } from 'vitest';
import { COASTAL_HIGHWAY } from '../constants/maps';
import { LANE_CENTERS, ROAD } from '../constants/game';
import { RaceSimulation } from './raceSimulation';
import { Track } from './track';
import { sanitizePlayerName } from '../schemas/playerName';

const DT = 1 / 60;

function soloRace(trafficCount = 0) {
  return new RaceSimulation({
    track: COASTAL_HIGHWAY,
    racers: [{ id: 'p1', name: 'Player', bikeId: 'viper', isHuman: true }],
    trafficCount,
    seed: 42,
    countdownSeconds: 0.01,
  });
}

function run(sim: RaceSimulation, seconds: number, onTick?: () => void) {
  for (let i = 0; i < seconds * 60; i++) {
    onTick?.();
    sim.step(DT);
  }
}

describe('Track', () => {
  it('is arc-length parameterised and continuous', () => {
    const track = new Track(COASTAL_HIGHWAY);
    const a = track.sample(1000);
    const b = track.sample(1010);
    expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeCloseTo(10, 0);
    const start = track.sample(0);
    expect(Math.abs(start.x)).toBeLessThan(1e-6);
    expect(start.tz).toBeLessThan(-0.99);
  });
});

describe('Bike physics', () => {
  it('accelerates towards top speed and nitro exceeds it', () => {
    const sim = soloRace();
    run(sim, 12, () => sim.setInput('p1', { throttle: 1 }));
    const p = sim.getRacer('p1')!;
    expect(p.v).toBeGreaterThan(60);
    expect(p.v).toBeLessThanOrEqual(72.5);
    run(sim, 1.5, () => sim.setInput('p1', { throttle: 1, nitro: true }));
    expect(p.v).toBeGreaterThan(72);
    expect(p.nitro).toBeLessThan(50);
  });

  it('brakes to a stop', () => {
    const sim = soloRace();
    run(sim, 5, () => sim.setInput('p1', { throttle: 1 }));
    run(sim, 4, () => sim.setInput('p1', { brake: 1 }));
    expect(sim.getRacer('p1')!.v).toBe(0);
  });

  it('keeps the bike inside the guard rails and damages it on impact', () => {
    const sim = soloRace();
    run(sim, 6, () => sim.setInput('p1', { throttle: 1, steer: 1 }));
    const p = sim.getRacer('p1')!;
    expect(p.d).toBeLessThanOrEqual(ROAD.barrierOffset);
    expect(p.health).toBeLessThan(100);
  });

  it('rejects malformed input', () => {
    const sim = soloRace();
    sim.setInput('p1', { throttle: 50, steer: Number.NaN, nitro: 'yes' as unknown as boolean });
    run(sim, 3);
    const p = sim.getRacer('p1')!;
    expect(p.v).toBeLessThan(80);
    expect(p.nitroActive).toBe(false);
  });
});

describe('Traffic collisions', () => {
  it('damages the bike when it rams a vehicle and wrecks it on repeated hits', () => {
    const sim = soloRace(1);
    const v = sim.traffic.vehicles[0];
    sim.step(DT);
    Object.assign(v, { active: true, lane: 2, targetLane: 2, d: LANE_CENTERS[2], s: 60, speed: 0, baseSpeed: 0, dir: 1 });
    const p = sim.getRacer('p1')!;
    p.d = LANE_CENTERS[2];
    let collided = false;
    for (let i = 0; i < 600 && !collided; i++) {
      sim.setInput('p1', { throttle: 1 });
      sim.step(DT);
      collided = sim.drainEvents().some((e) => e.type === 'collision');
      v.speed = 0;
    }
    expect(collided).toBe(true);
    expect(p.health).toBeLessThan(100);
  });
});

describe('Race flow', () => {
  it('AI rivals complete the race through traffic and standings are ordered', () => {
    const sim = new RaceSimulation({
      track: COASTAL_HIGHWAY,
      racers: [
        { id: 'a', name: 'A', bikeId: 'viper', isHuman: false, skill: 0.95 },
        { id: 'b', name: 'B', bikeId: 'blade', isHuman: false, skill: 0.95 },
      ],
      trafficCount: 30,
      seed: 7,
      countdownSeconds: 0.01,
    });
    run(sim, 240);
    expect(sim.phase).toBe('finished');
    const standings = sim.standings();
    expect(standings[0].finishTime!).toBeLessThanOrEqual(standings[1].finishTime!);
    expect(standings.map((r) => r.place)).toEqual([1, 2]);
  });

  it('AI rivals fight each other and collect weapons during a race', () => {
    const sim = new RaceSimulation({
      track: COASTAL_HIGHWAY,
      racers: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: id, bikeId: (['viper', 'blade', 'thunder', 'viper'] as const)[i], isHuman: false, skill: 0.95, aggression: 0.8 })),
      trafficCount: 20,
      seed: 11,
      countdownSeconds: 0.01,
    });
    let hits = 0;
    let pickups = 0;
    for (let i = 0; i < 240 * 60 && sim.phase !== 'finished'; i++) {
      sim.step(DT);
      for (const e of sim.drainEvents()) {
        if (e.type === 'hit') hits++;
        if (e.type === 'pickup') pickups++;
      }
    }
    expect(sim.phase).toBe('finished');
    expect(hits).toBeGreaterThan(5);
    expect(pickups).toBeGreaterThan(0);
  });
});

describe('sanitizePlayerName', () => {
  it('strips markup and clamps length', () => {
    expect(sanitizePlayerName('<script>alert(1)</script>Rider')).toBe('scriptalert1scri');
    expect(sanitizePlayerName('  Ace   Rider  ')).toBe('Ace Rider');
    expect(sanitizePlayerName('x')).toBe('Rider');
  });
});
