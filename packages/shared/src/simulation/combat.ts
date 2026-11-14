import { BIKES } from '../constants/bikes';
import { ATTACKS, COMBAT, WEAPONS, WEAPON_LIST, type AttackSpec } from '../constants/combat';
import { LANE_CENTERS } from '../constants/game';
import type { AttackKind, BikeInput, CombatState, PickupState, RaceEvent, RacerState, WeaponId } from '../types';
import type { Rng } from './math';

export function createCombatState(): CombatState {
  return {
    attack: null,
    attackWeapon: null,
    attackTimer: 0,
    attackResolved: false,
    attackSide: 1,
    attackTargetId: null,
    attackSeq: 0,
    cooldowns: { punch: 0, kick: 0, weapon: 0 },
    blocking: false,
    stagger: 0,
    knockbackV: 0,
    shield: 0,
    weapon: null,
    weaponUses: 0,
    lastHitBy: null,
    lastHitTime: -Infinity,
    hitFlash: 0,
    hitsLanded: 0,
    knockouts: 0,
    damageDealt: 0,
  };
}

export function attackSpec(kind: AttackKind, weapon: WeaponId | null): AttackSpec | null {
  if (kind === 'weapon') return weapon ? WEAPONS[weapon] : null;
  return ATTACKS[kind];
}

/** The spec of the swing currently in progress. */
export function currentAttackSpec(c: CombatState): AttackSpec | null {
  return c.attack ? attackSpec(c.attack, c.attackWeapon) : null;
}

function isTargetable(o: RacerState) {
  return !o.crashed && !o.finished && o.combat.shield <= 0;
}

/**
 * Nearest rider the attacker can reach with `spec`. `side` restricts the search to one side
 * (1 = right, -1 = left, 0 = either). This is the single source of truth for hit validation.
 */
export function findTarget(attacker: RacerState, racers: readonly RacerState[], spec: AttackSpec, side: 1 | -1 | 0, slack = 1): RacerState | null {
  let best: RacerState | null = null;
  let bestScore = Infinity;
  for (const o of racers) {
    if (o === attacker || !isTargetable(o)) continue;
    const ds = Math.abs(o.s - attacker.s);
    if (ds > spec.rangeS * slack) continue;
    const dd = o.d - attacker.d;
    const ad = Math.abs(dd);
    if (ad < COMBAT.minTargetGap || ad > spec.rangeD * slack) continue;
    if (side !== 0 && Math.sign(dd) !== side) continue;
    const score = ds + ad;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

/** Reduces control while staggered or blocking. Returns the effective input for the bike physics. */
export function applyCombatModifiers(r: RacerState, input: BikeInput): BikeInput {
  const c = r.combat;
  if (c.stagger <= 0 && !c.blocking) return input;
  const out = { ...input };
  if (c.stagger > 0) {
    out.steer = Math.max(-1, Math.min(1, input.steer * 0.3 + Math.sin(c.stagger * 25) * 0.5));
    out.throttle *= 0.5;
    out.nitro = false;
    out.wheelie = false;
  }
  if (c.blocking) {
    out.throttle = Math.min(out.throttle, COMBAT.blockThrottleCap);
    out.nitro = false;
    out.wheelie = false;
  }
  return out;
}

function resolveHit(r: RacerState, spec: AttackSpec, racers: readonly RacerState[], time: number, events: RaceEvent[]) {
  const c = r.combat;
  const kind = c.attack!;
  const target = findTarget(r, racers, spec, c.attackSide);
  if (!target) {
    events.push({ type: 'attackMiss', racerId: r.id, kind });
    return;
  }
  const t = target.combat;
  const blocked = t.blocking;
  const damage = (spec.damage * (blocked ? COMBAT.blockDamageFactor : 1)) / BIKES[target.bikeId].stats.durability;
  target.health -= damage;
  t.knockbackV += c.attackSide * spec.knockback * (blocked ? COMBAT.blockKnockbackFactor : 1);
  t.lastHitBy = r.id;
  t.lastHitTime = time;
  t.hitFlash = 0.3;
  if (blocked) {
    c.stagger = Math.max(c.stagger, COMBAT.blockRecoilStagger);
  } else {
    t.stagger = Math.max(t.stagger, spec.stagger);
    target.v *= 1 - spec.speedLoss;
    // A clean hit interrupts the target's own wind-up.
    if (t.attack && !t.attackResolved) t.attack = null;
  }

  c.hitsLanded++;
  c.damageDealt += damage;
  r.score += Math.round(COMBAT.hitScore * (blocked ? 0.3 : 1) * r.combo);

  const weapon = c.attackWeapon;
  if (kind === 'weapon' && weapon && c.weapon === weapon) {
    c.weaponUses--;
    if (c.weaponUses <= 0) {
      c.weapon = null;
      c.weaponUses = 0;
      events.push({ type: 'weaponBreak', racerId: r.id, weapon });
    }
  }
  events.push({ type: 'hit', attackerId: r.id, targetId: target.id, kind, weapon, damage, blocked, side: c.attackSide, s: target.s, d: target.d });
}

/**
 * Advances one rider's combat for a tick. Input only expresses intent; range, cooldown,
 * weapon possession, damage and knockback are all decided here.
 */
export function updateCombat(r: RacerState, input: BikeInput, racers: readonly RacerState[], time: number, dt: number, events: RaceEvent[]) {
  const c = r.combat;
  c.stagger = Math.max(0, c.stagger - dt);
  c.hitFlash = Math.max(0, c.hitFlash - dt);
  c.shield = Math.max(0, c.shield - dt);
  c.cooldowns.punch = Math.max(0, c.cooldowns.punch - dt);
  c.cooldowns.kick = Math.max(0, c.cooldowns.kick - dt);
  c.cooldowns.weapon = Math.max(0, c.cooldowns.weapon - dt);

  if (r.finished) {
    c.attack = null;
    c.blocking = false;
    return;
  }

  if (c.attack) {
    c.blocking = false;
    const spec = currentAttackSpec(c)!;
    c.attackTimer += dt;
    if (!c.attackResolved && c.attackTimer >= spec.windup) {
      c.attackResolved = true;
      resolveHit(r, spec, racers, time, events);
    }
    if (c.attack && c.attackTimer >= spec.windup + spec.recovery) c.attack = null;
    return;
  }

  c.blocking = input.block && c.stagger <= 0;
  if (c.blocking || c.stagger > 0) return;

  const kind: AttackKind | null = input.weapon && c.weapon ? 'weapon' : input.kick ? 'kick' : input.punch ? 'punch' : null;
  if (!kind || c.cooldowns[kind] > 0) return;
  const weapon = kind === 'weapon' ? c.weapon : null;
  const spec = attackSpec(kind, weapon)!;
  const target = findTarget(r, racers, spec, 0, COMBAT.targetingSlack);
  c.attack = kind;
  c.attackWeapon = weapon;
  c.attackTimer = 0;
  c.attackResolved = false;
  c.attackSide = target ? (target.d >= r.d ? 1 : -1) : input.steer < -0.2 ? -1 : input.steer > 0.2 ? 1 : c.attackSide === 1 ? -1 : 1;
  c.attackTargetId = target?.id ?? null;
  c.attackSeq++;
  c.cooldowns[kind] = spec.cooldown;
  events.push({ type: 'attack', racerId: r.id, kind, weapon, side: c.attackSide });
}

/** Clears transient combat state when a rider wrecks; the held weapon is lost. */
export function resetCombatOnWreck(c: CombatState) {
  c.attack = null;
  c.attackWeapon = null;
  c.blocking = false;
  c.stagger = 0;
  c.knockbackV = 0;
  c.weapon = null;
  c.weaponUses = 0;
}

export function createPickups(raceLength: number, rng: Rng): PickupState[] {
  const pickups: PickupState[] = [];
  let id = 0;
  for (let s = COMBAT.pickupFirst; s < raceLength - 200; s += COMBAT.pickupSpacing * rng.range(0.8, 1.2)) {
    pickups.push({ id: id++, s, d: rng.pick([LANE_CENTERS[2], LANE_CENTERS[3], LANE_CENTERS[1]]), weapon: rng.pick(WEAPON_LIST), active: true, respawnTimer: 0 });
  }
  return pickups;
}

export function updatePickups(pickups: PickupState[], racers: readonly RacerState[], dt: number, events: RaceEvent[]) {
  for (const p of pickups) {
    if (!p.active) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) p.active = true;
      continue;
    }
    for (const r of racers) {
      if (r.crashed || r.finished || r.combat.weapon) continue;
      if (Math.abs(r.s - p.s) > COMBAT.pickupRadiusS || Math.abs(r.d - p.d) > COMBAT.pickupRadiusD) continue;
      r.combat.weapon = p.weapon;
      r.combat.weaponUses = WEAPONS[p.weapon].uses;
      p.active = false;
      p.respawnTimer = COMBAT.pickupRespawn;
      events.push({ type: 'pickup', racerId: r.id, weapon: p.weapon, pickupId: p.id });
      break;
    }
  }
}
