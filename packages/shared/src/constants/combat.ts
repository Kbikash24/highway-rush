import type { AttackKind, WeaponId } from '../types';

export interface AttackSpec {
  name: string;
  /** Seconds before the hit is checked (telegraph; can be blocked or interrupted). */
  windup: number;
  /** Seconds after the hit check before the rider can act again. */
  recovery: number;
  /** Seconds from attack start until the same attack can be used again. */
  cooldown: number;
  damage: number;
  /** Max longitudinal distance between riders (m). */
  rangeS: number;
  /** Max lateral centre-to-centre distance between riders (m). */
  rangeD: number;
  /** Lateral knockback velocity applied to the target (m/s). */
  knockback: number;
  /** Seconds of target control loss. */
  stagger: number;
  /** Fraction of the target's speed removed on an unblocked hit. */
  speedLoss: number;
}

export interface WeaponSpec extends AttackSpec {
  id: WeaponId;
  uses: number;
  color: string;
}

export const ATTACKS: Record<Exclude<AttackKind, 'weapon'>, AttackSpec> = {
  punch: { name: 'Punch', windup: 0.12, recovery: 0.22, cooldown: 0.55, damage: 7, rangeS: 1.8, rangeD: 1.8, knockback: 2.2, stagger: 0.35, speedLoss: 0.04 },
  kick: { name: 'Kick', windup: 0.22, recovery: 0.3, cooldown: 1.0, damage: 11, rangeS: 2.0, rangeD: 2.2, knockback: 5.5, stagger: 0.6, speedLoss: 0.07 },
};

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  bat: {
    id: 'bat',
    name: 'Bat',
    windup: 0.26,
    recovery: 0.3,
    cooldown: 1.1,
    damage: 18,
    rangeS: 2.3,
    rangeD: 2.5,
    knockback: 4.5,
    stagger: 0.9,
    speedLoss: 0.1,
    uses: 6,
    color: '#c08a4a',
  },
  chain: {
    id: 'chain',
    name: 'Chain',
    windup: 0.2,
    recovery: 0.3,
    cooldown: 0.9,
    damage: 13,
    rangeS: 2.5,
    rangeD: 3.0,
    knockback: 3.2,
    stagger: 0.7,
    speedLoss: 0.06,
    uses: 8,
    color: '#9ca3af',
  },
};

export const WEAPON_LIST: WeaponId[] = ['bat', 'chain'];

export const COMBAT = {
  blockDamageFactor: 0.3,
  blockKnockbackFactor: 0.25,
  /** Blocking caps throttle (you ride defensively). */
  blockThrottleCap: 0.75,
  /** Attacker recoils when the blow is blocked. */
  blockRecoilStagger: 0.25,
  /** Targets closer than this laterally are "under" the attacker and can't be hit. */
  minTargetGap: 0.15,
  /** Extra lenience when picking the swing side at attack start. */
  targetingSlack: 1.35,
  knockbackDecay: 5,
  pickupRadiusS: 1.8,
  pickupRadiusD: 1.4,
  pickupRespawn: 15,
  pickupFirst: 220,
  pickupSpacing: 320,
  hitScore: 60,
  knockoutScore: 600,
  /** A wreck within this many seconds of being hit is credited to the attacker. */
  knockoutWindow: 3,
} as const;
