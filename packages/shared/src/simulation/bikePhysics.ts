import { BIKE_SIZE, PHYSICS, ROAD } from '../constants/game';
import { COMBAT } from '../constants/combat';
import type { BikeInput, BikeStats, RaceEvent, RacerState } from '../types';
import { applyCombatModifiers } from './combat';
import { clamp, damp } from './math';
import type { Track, TrackSample } from './track';
import { createTrackSample } from './track';

const scratch: TrackSample = createTrackSample();

export function sanitizeInput(input: Partial<BikeInput> | undefined): BikeInput {
  const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : 0);
  return {
    throttle: num(input?.throttle, 0, 1),
    brake: num(input?.brake, 0, 1),
    steer: num(input?.steer, -1, 1),
    nitro: input?.nitro === true,
    wheelie: input?.wheelie === true,
    punch: input?.punch === true,
    kick: input?.kick === true,
    weapon: input?.weapon === true,
    block: input?.block === true,
  };
}

/** Max heading offset from the road tangent; narrows at speed for stable high-speed handling. */
export function maxYawFor(v: number, stats: BikeStats, wheelie: number): number {
  const speedFactor = Math.min(1, v / 60);
  return (0.5 - 0.38 * speedFactor) * stats.handling * (wheelie > 0.3 ? 0.45 : 1);
}

/**
 * Advances a single (non-crashed) bike by dt using an arcade model in road space.
 * Pure and deterministic so the authoritative server can run the exact same code.
 */
export function stepBike(r: RacerState, rawInput: BikeInput, stats: BikeStats, track: Track, dt: number, events: RaceEvent[]): void {
  const input = applyCombatModifiers(r, rawInput);
  const road = track.sample(r.s, scratch);
  r.offroad = Math.abs(r.d) > ROAD.halfWidth + 0.3;
  r.throttle = input.throttle;
  r.braking = input.brake > 0.1;

  // Nitro
  const wantsNitro = input.nitro && r.nitro > 0 && r.v > 8 && input.throttle > 0 && input.brake < 0.1;
  if (wantsNitro !== r.nitroActive) events.push({ type: 'nitro', racerId: r.id, active: wantsNitro });
  r.nitroActive = wantsNitro;
  if (wantsNitro) {
    r.nitro = Math.max(0, r.nitro - PHYSICS.nitroBurnRate * dt);
  } else {
    const wheelieBonus = r.wheelie > 0.7 ? 6 : 0;
    r.nitro = Math.min(stats.nitroCapacity, r.nitro + (PHYSICS.nitroRegenRate + wheelieBonus) * dt);
  }

  // Longitudinal
  const top = stats.topSpeed * r.speedScale * (r.nitroActive ? PHYSICS.nitroTopSpeedMultiplier : 1) * (r.offroad ? PHYSICS.offroadSpeedFactor : 1);
  let a = 0;
  if (input.throttle > 0) {
    const ratio = r.v / top;
    a += stats.acceleration * input.throttle * Math.max(0, 1 - ratio * ratio);
  } else {
    a -= PHYSICS.coastDrag + PHYSICS.airDrag * r.v * r.v;
  }
  if (r.nitroActive) a += PHYSICS.nitroAcceleration;
  if (r.v > top) a -= (r.v - top) * 1.5;
  if (r.offroad) a -= PHYSICS.offroadDrag;
  a -= input.brake * stats.braking;
  a -= PHYSICS.gravity * road.ty * 0.5;
  r.v = Math.max(0, r.v + a * dt);
  r.topSpeed = Math.max(r.topSpeed, r.v);

  // Wheelie stunt
  const canWheelie = input.wheelie && r.v > 12 && input.throttle > 0 && input.brake < 0.1;
  r.wheelie = clamp(r.wheelie + (canWheelie ? 2 : -3) * dt, 0, 1);
  if (r.wheelie > 0.75) {
    r.wheelieTime += dt;
  } else if (r.wheelieTime > 0) {
    if (r.wheelieTime >= 1) {
      const points = Math.round(r.wheelieTime * 150) * r.combo;
      r.score += points;
      events.push({ type: 'stunt', racerId: r.id, points, label: `WHEELIE ${r.wheelieTime.toFixed(1)}s` });
    }
    r.wheelieTime = 0;
  }

  // Steering
  const maxYaw = maxYawFor(r.v, stats, r.wheelie);
  const targetYaw = input.steer * maxYaw;
  const yawRate = 2.8 * stats.handling;
  r.yaw += clamp(targetYaw - r.yaw, -yawRate * dt, yawRate * dt);
  r.lean += (input.steer * Math.min(1, r.v / 15) * 0.65 - r.lean) * damp(8, dt);

  // Integrate in road space; curves push the bike towards the outside, combat hits knock it sideways.
  const drift = road.curvature * r.v * r.v * PHYSICS.curveDrift;
  const lateralVelocity = r.v * Math.sin(r.yaw) - drift + r.combat.knockbackV;
  r.combat.knockbackV *= Math.exp(-COMBAT.knockbackDecay * dt);
  r.s += r.v * Math.cos(r.yaw) * dt;
  r.d += lateralVelocity * dt;

  // Guard rails
  const limit = ROAD.barrierOffset - BIKE_SIZE.width / 2 - 0.1;
  if (Math.abs(r.d) > limit) {
    const side: 1 | -1 = r.d > 0 ? 1 : -1;
    const impact = Math.max(0, lateralVelocity * side);
    r.d = side * limit;
    r.combat.knockbackV = 0;
    if (r.yaw * side > 0) r.yaw = -r.yaw * 0.4;
    r.v = Math.max(0, r.v * (1 - Math.min(0.45, impact * 0.035)) - 8 * dt);
    if (r.invulnerable <= 0) {
      const damage = impact > 3 ? (impact * 1.6) / stats.durability : (5 * dt) / stats.durability;
      r.health -= damage;
    }
    if (impact > 1.5 || r.v > 5) events.push({ type: 'barrier', racerId: r.id, impact, s: r.s, d: r.d, side });
  }
}
