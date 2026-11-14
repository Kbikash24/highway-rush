import { BIKE_SIZE, LANE_CENTERS, PHYSICS, ROAD } from '../constants/game';
import { BIKES } from '../constants/bikes';
import { ATTACKS, WEAPONS } from '../constants/combat';
import type { BikeInput, PickupState, RacerState, TrafficVehicle } from '../types';
import { maxYawFor } from './bikePhysics';
import { findTarget } from './combat';
import { clamp, type Rng } from './math';
import type { Track } from './track';
import { createTrackSample } from './track';

const scratch = createTrackSample();

/** Seconds until the racer would reach a vehicle occupying lateral position `d`. */
function timeToContact(r: RacerState, d: number, traffic: readonly TrafficVehicle[], lookahead: number): number {
  let best = 99;
  for (const v of traffic) {
    if (!v.active) continue;
    const gap = v.s - r.s - (v.length + BIKE_SIZE.length) / 2;
    if (gap < -1 || gap > lookahead) continue;
    if (Math.abs(v.d - d) > (v.width + BIKE_SIZE.width) / 2 + 0.6) continue;
    const closing = r.v - v.speed * v.dir;
    const ttc = gap <= 0 ? 0 : closing <= 0.1 ? 99 : gap / closing;
    if (ttc < best) best = ttc;
  }
  return best;
}

export interface AIContext {
  traffic: readonly TrafficVehicle[];
  racers: readonly RacerState[];
  pickups: readonly PickupState[];
  track: Track;
  rng: Rng;
}

interface Candidate {
  d: number;
  bonus: number;
}

export function computeAIInput(r: RacerState, ctx: AIContext, dt: number): BikeInput {
  const ai = r.ai!;
  const c = r.combat;
  const stats = BIKES[r.bikeId].stats;
  const lookahead = 30 + r.v * 2.2;

  // Nearest opponent worth fighting (humans are preferred targets).
  let rival: RacerState | null = null;
  let rivalDist = Infinity;
  for (const o of ctx.racers) {
    if (o === r || o.crashed || o.finished) continue;
    const ds = o.s - r.s;
    if (ds < -8 || ds > 30 || Math.abs(o.d - r.d) > 9) continue;
    const dist = Math.abs(ds) + Math.abs(o.d - r.d) * 0.5 - (o.isHuman ? 3 : 0);
    if (dist < rivalDist) {
      rivalDist = dist;
      rival = o;
    }
  }

  ai.decisionTimer -= dt;
  if (ai.decisionTimer <= 0) {
    ai.decisionTimer = 0.25;
    const candidates: Candidate[] = [...LANE_CENTERS, ai.targetD, ROAD.halfWidth - 0.6, -ROAD.halfWidth + 0.6].map((d) => ({ d, bonus: 0 }));
    if (rival && ai.aggression > 0.2) {
      const side = rival.d >= r.d ? -1 : 1;
      candidates.push({ d: clamp(rival.d + side * 1.4, -ROAD.halfWidth, ROAD.halfWidth), bonus: ai.aggression * (rival.isHuman ? 1.6 : 1.1) });
    }
    if (!c.weapon) {
      for (const p of ctx.pickups) {
        const ahead = p.s - r.s;
        if (p.active && ahead > 5 && ahead < 140) candidates.push({ d: p.d, bonus: 1.2 });
      }
    }
    let bestD = ai.targetD;
    let bestScore = -Infinity;
    for (const { d, bonus } of candidates) {
      const ttc = timeToContact(r, d, ctx.traffic, lookahead);
      let score = Math.min(ttc, 6) + (ttc > 2.5 ? bonus : 0);
      if (d < 0) score -= 0.6; // prefer flowing with traffic
      score -= Math.abs(d - r.d) * 0.06;
      if (d === ai.targetD) score += 0.4;
      if (score > bestScore) {
        bestScore = score;
        bestD = d;
      }
    }
    ai.targetD = bestD;
  }

  const road = ctx.track.sample(r.s, scratch);
  const maxYaw = maxYawFor(r.v, stats, 0) || 0.01;
  const driftComp = (road.curvature * r.v * r.v * PHYSICS.curveDrift) / Math.max(1, r.v) / maxYaw;
  const steer = clamp((ai.targetD - r.d) * 0.35 - (r.yaw / maxYaw) * 0.6 + driftComp, -1, 1);

  const ttcHere = timeToContact(r, r.d, ctx.traffic, lookahead);
  const danger = ttcHere < 0.9 && Math.abs(ai.targetD - r.d) < 1.2;
  const nitro = !danger && r.nitro > 30 && ttcHere > 3 && Math.abs(road.curvature) < 0.002 && ai.nitroBias > 0.4;

  // Defence: decide once per incoming swing whether to block it.
  let threatKey: string | null = null;
  for (const o of ctx.racers) {
    if (o !== r && o.combat.attack && !o.combat.attackResolved && o.combat.attackTargetId === r.id) {
      threatKey = `${o.id}:${o.combat.attackSeq}`;
      break;
    }
  }
  if (threatKey !== ai.threatKey) {
    ai.threatKey = threatKey;
    ai.blockThreat = threatKey !== null && ctx.rng.chance(0.15 + ai.skill * 0.25);
  }
  const block = ai.blockThreat && threatKey !== null;

  // Offence: periodically try the strongest attack that would connect.
  let punch = false;
  let kick = false;
  let weapon = false;
  ai.combatTimer -= dt;
  if (!block && !c.attack && ai.aggression > 0.05 && ai.combatTimer <= 0) {
    ai.combatTimer = ctx.rng.range(0.25, 0.8) / Math.max(0.2, ai.aggression);
    if (c.weapon && c.cooldowns.weapon <= 0 && findTarget(r, ctx.racers, WEAPONS[c.weapon], 0)) weapon = true;
    else if (c.cooldowns.kick <= 0 && findTarget(r, ctx.racers, ATTACKS.kick, 0)) kick = true;
    else if (c.cooldowns.punch <= 0 && findTarget(r, ctx.racers, ATTACKS.punch, 0)) punch = true;
  }

  // Ease off alongside a rival that's just behind to keep the fight going.
  const engaged = rival !== null && ai.aggression > 0.5 && rival.s - r.s < -1.2 && rival.s - r.s > -6 && Math.abs(rival.d - r.d) < 3;
  const throttle = danger ? 0 : engaged ? 0.55 : 1;

  return {
    throttle,
    brake: danger ? 1 : 0,
    steer,
    nitro: nitro && !engaged,
    wheelie: false,
    punch,
    kick,
    weapon,
    block,
  };
}
