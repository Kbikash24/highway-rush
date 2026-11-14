import { describe, expect, it } from 'vitest';
import { COASTAL_HIGHWAY } from '../constants/maps';
import { ATTACKS, COMBAT, WEAPONS } from '../constants/combat';
import type { BikeInput, RaceEvent } from '../types';
import { RaceSimulation } from './raceSimulation';

const DT = 1 / 60;

/** Two human riders side by side, no traffic or pickups, already racing. */
function duel(gap = 1.4) {
  const sim = new RaceSimulation({
    track: COASTAL_HIGHWAY,
    racers: [
      { id: 'a', name: 'A', bikeId: 'viper', isHuman: true },
      { id: 'b', name: 'B', bikeId: 'viper', isHuman: true },
    ],
    trafficCount: 0,
    seed: 1,
    countdownSeconds: 0.01,
    pickups: false,
  });
  sim.step(DT);
  const a = sim.getRacer('a')!;
  const b = sim.getRacer('b')!;
  Object.assign(a, { s: 100, d: 0 });
  Object.assign(b, { s: 100, d: gap });
  return { sim, a, b };
}

function run(sim: RaceSimulation, seconds: number, inputs: Record<string, Partial<BikeInput>>, hold?: () => void) {
  const events: RaceEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    for (const [id, input] of Object.entries(inputs)) sim.setInput(id, input);
    hold?.();
    sim.step(DT);
    events.push(...sim.drainEvents());
  }
  return events;
}

describe('Combat', () => {
  it('lands a punch on an adjacent rider: damage, knockback away from attacker, stagger', () => {
    const { sim, a, b } = duel();
    const events = run(sim, 0.2, { a: { punch: true } });
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ attackerId: 'a', targetId: 'b', kind: 'punch', blocked: false, side: 1 });
    expect(b.health).toBeCloseTo(100 - ATTACKS.punch.damage, 5);
    expect(b.combat.knockbackV).toBeGreaterThan(0);
    expect(b.combat.stagger).toBeGreaterThan(0);
    expect(a.combat.hitsLanded).toBe(1);
  });

  it('misses when the target is out of range (server-side range validation)', () => {
    const { sim, b } = duel(4);
    const events = run(sim, 0.3, { a: { kick: true } });
    expect(events.some((e) => e.type === 'attackMiss')).toBe(true);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(b.health).toBe(100);
  });

  it('enforces cooldowns no matter how often the input is sent', () => {
    const { sim } = duel();
    const events = run(sim, ATTACKS.kick.cooldown - 0.05, { a: { kick: true } });
    expect(events.filter((e) => e.type === 'attack')).toHaveLength(1);
  });

  it('blocking cuts damage and knockback and makes the attacker recoil', () => {
    const { sim, a, b } = duel();
    const events = run(sim, 0.4, { a: { kick: true }, b: { block: true } });
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ blocked: true });
    expect(100 - b.health).toBeCloseTo(ATTACKS.kick.damage * COMBAT.blockDamageFactor, 5);
    expect(b.combat.stagger).toBe(0);
    expect(a.combat.stagger).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'hit' && e.targetId === 'b' && !e.blocked)).toBe(false);
  });

  it('weapon attacks require a picked-up weapon, which wears out', () => {
    const { sim, a, b } = duel();
    let events = run(sim, 0.4, { a: { weapon: true } });
    expect(events.some((e) => e.type === 'attack')).toBe(false);

    sim.pickups.push({ id: 99, s: a.s, d: a.d, weapon: 'bat', active: true, respawnTimer: 0 });
    events = run(sim, DT, {});
    expect(events.find((e) => e.type === 'pickup')).toMatchObject({ racerId: 'a', weapon: 'bat' });
    expect(a.combat.weapon).toBe('bat');

    let broke = false;
    for (let i = 0; i < WEAPONS.bat.uses && !broke; i++) {
      b.health = 100;
      b.combat.knockbackV = 0;
      events = run(sim, WEAPONS.bat.cooldown + 0.05, { a: { weapon: true } }, () => {
        b.d = a.d + 1.4;
        b.s = a.s;
      });
      broke = events.some((e) => e.type === 'weaponBreak');
    }
    expect(broke).toBe(true);
    expect(a.combat.weapon).toBeNull();
  });

  it('credits a knockout when the victim wrecks shortly after being hit', () => {
    const { sim, a, b } = duel();
    b.health = 5;
    const events = run(sim, 0.3, { a: { punch: true } });
    expect(events.find((e) => e.type === 'knockout')).toMatchObject({ attackerId: 'a', targetId: 'b' });
    expect(b.crashed).toBe(true);
    expect(a.combat.knockouts).toBe(1);
  });

  it('respawned riders are shielded from attacks', () => {
    const { sim, b } = duel();
    b.combat.shield = 1;
    const events = run(sim, 0.3, { a: { punch: true } });
    expect(events.some((e) => e.type === 'hit')).toBe(false);
  });
});
