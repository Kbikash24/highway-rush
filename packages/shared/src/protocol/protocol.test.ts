import { describe, expect, it } from 'vitest';
import { COASTAL_HIGHWAY } from '../constants/maps';
import { RaceSimulation, type RaceConfig } from '../simulation/raceSimulation';
import { createRng } from '../simulation/math';
import { setAIControl } from '../simulation/aiControl';
import { buildResultRows } from '../simulation/results';
import {
  NET,
  normalizeRoomCode,
  packInput,
  parseInputMessage,
  unpackInput,
} from './messages';
import { RACER_FIELD_COUNT, decodePickups, decodeRacer, decodeTrafficRow, encodeSnapshot, isValidSnapshot, lerpRacerValues } from './snapshot';
import type { BikeInput } from '../types';

const DT = 1 / 60;

const config = (): RaceConfig => ({
  track: COASTAL_HIGHWAY,
  racers: [
    { id: 'a', name: 'A', bikeId: 'viper', isHuman: true },
    { id: 'b', name: 'B', bikeId: 'blade', isHuman: true },
    { id: 'c', name: 'C', bikeId: 'thunder', isHuman: false, skill: 0.95 },
  ],
  trafficCount: 30,
  seed: 4242,
  countdownSeconds: 0.01,
});

describe('input packing', () => {
  it('round-trips every flag and quantised steering', () => {
    const input: BikeInput = { throttle: 1, brake: 0, steer: -0.5, nitro: true, wheelie: false, punch: true, kick: false, weapon: true, block: true };
    const out = unpackInput(packInput(input))!;
    expect(out).toMatchObject({ throttle: 1, brake: 0, nitro: true, wheelie: false, punch: true, kick: false, weapon: true, block: true });
    expect(out.steer).toBeCloseTo(-0.5, 1);
  });

  it('rejects malformed values (cheat/garbage resistance)', () => {
    for (const bad of [-1, 1.5, NaN, Infinity, 'x', null, undefined, {}, 0xffff, 2 ** 40]) expect(unpackInput(bad)).toBeNull();
    expect(parseInputMessage({ s: 1, i: [] })).toBeNull();
    expect(parseInputMessage({ s: -4, i: [0] })).toBeNull();
    expect(parseInputMessage({ s: 1, i: new Array(NET.maxInputsPerMessage + 1).fill(0) })).toBeNull();
    expect(parseInputMessage({ s: 1, i: [packInput({ throttle: 1, brake: 0, steer: 0, nitro: false, wheelie: false, punch: false, kick: false, weapon: false, block: false }), 'bad'] })).toBeNull();
    expect(parseInputMessage(null)).toBeNull();
    expect(parseInputMessage({ s: 3, i: [0, 0] })?.inputs).toHaveLength(2);
  });
});

describe('room codes', () => {
  it('normalises valid codes and rejects ambiguous or wrong-length ones', () => {
    expect(normalizeRoomCode('ab-c2d')).toBe('ABC2D');
    expect(normalizeRoomCode('ABCD')).toBeNull();
    expect(normalizeRoomCode('ABCDO')).toBeNull();
    expect(normalizeRoomCode(12345)).toBeNull();
  });
});

describe('determinism & snapshots', () => {
  it('constructing a simulation from the same config yields identical traffic kinds and pickups (client mirror relies on this)', () => {
    const a = new RaceSimulation(config());
    const b = new RaceSimulation(config());
    expect(b.traffic.vehicles.map((v) => v.kind)).toEqual(a.traffic.vehicles.map((v) => v.kind));
    expect(b.pickups.map((p) => [p.s, p.d, p.weapon])).toEqual(a.pickups.map((p) => [p.s, p.d, p.weapon]));
  });

  it('snapshot round-trips racer, traffic and pickup state within fixed-point precision', () => {
    const sim = new RaceSimulation(config());
    for (let i = 0; i < 600; i++) {
      sim.setInput('a', { throttle: 1, steer: Math.sin(i / 40) * 0.4, punch: i % 50 === 0 });
      sim.step(DT);
    }
    sim.pickups[1].active = false;
    const snap = encodeSnapshot(sim, 77, [], sim.getRacer('a')!.s);
    expect(isValidSnapshot(JSON.parse(JSON.stringify(snap)), 3)).toBe(true);
    expect(snap.r[0]).toHaveLength(RACER_FIELD_COUNT);

    const mirror = new RaceSimulation(config());
    mirror.racers.forEach((r, i) => decodeRacer(snap.r[i], r));
    for (const [i, r] of sim.racers.entries()) {
      const m = mirror.racers[i];
      expect(m.s).toBeCloseTo(r.s, 1);
      expect(m.d).toBeCloseTo(r.d, 1);
      expect(m.v).toBeCloseTo(r.v, 1);
      expect(m.health).toBeCloseTo(r.health, 0);
      expect(m.finished).toBe(r.finished);
      expect(m.combat.weapon).toBe(r.combat.weapon);
      expect(m.combat.attackSeq).toBe(r.combat.attackSeq);
    }

    for (const row of snap.v) {
      const v = mirror.traffic.vehicles[row[0]];
      decodeTrafficRow(row, v);
      const src = sim.traffic.vehicles[row[0]];
      expect(v.s).toBeCloseTo(src.s, 1);
      expect(v.dir).toBe(src.dir);
      expect(v.kind).toBe(src.kind);
    }
    decodePickups(snap.p, mirror.pickups);
    expect(mirror.pickups.map((p) => p.active)).toEqual(sim.pickups.map((p) => p.active));
  });

  it('only sends traffic near the recipient (bandwidth)', () => {
    const sim = new RaceSimulation(config());
    const all = encodeSnapshot(sim, 0, [], -100000).v.length;
    expect(all).toBe(0);
    expect(encodeSnapshot(sim, 0, [], 500).v.length).toBeLessThanOrEqual(sim.traffic.vehicles.length);
  });

  it('interpolation blends continuous fields only', () => {
    const sim = new RaceSimulation(config());
    const a = sim.racers[0];
    const va = encodeSnapshot(sim, 0, [], 0).r[0];
    a.s = 100;
    a.combat.stagger = 0.5;
    const vb = encodeSnapshot(sim, 0, [], 0).r[0];
    const mid = lerpRacerValues(va, vb, 0.5);
    expect(mid[0]).toBeCloseTo((va[0] + vb[0]) / 2, 5);
    const staggerIndex = 26;
    expect(vb[staggerIndex]).toBe(500);
    expect(mid[staggerIndex]).toBe(va[staggerIndex]);
  });
});

describe('AI takeover for disconnected riders', () => {
  it('drives the bike and can be handed back to the human', () => {
    const sim = new RaceSimulation(config());
    sim.step(DT);
    const a = sim.getRacer('a')!;
    setAIControl(a, true, createRng(1));
    expect(a.isHuman).toBe(false);
    for (let i = 0; i < 600; i++) sim.step(DT);
    expect(a.s).toBeGreaterThan(100);
    setAIControl(a, false, createRng(1));
    expect(a.isHuman).toBe(true);
    expect(a.ai).toBeUndefined();
  });

  it('results mark riders that left', () => {
    const sim = new RaceSimulation(config());
    for (let i = 0; i < 60; i++) sim.step(DT);
    const rows = buildResultRows(sim, new Set(['a']));
    expect(rows.find((r) => r.id === 'a')).toMatchObject({ left: true, isHuman: true });
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3]);
  });
});
