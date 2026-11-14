export type BikeId = 'viper' | 'thunder' | 'blade';

export interface BikeStats {
  /** Top speed in m/s (without nitro). */
  topSpeed: number;
  /** Peak acceleration in m/s². */
  acceleration: number;
  /** Steering multiplier (1 = baseline). */
  handling: number;
  /** Braking deceleration in m/s². */
  braking: number;
  /** Damage divisor (higher takes less damage). */
  durability: number;
  /** Nitro tank size in units. */
  nitroCapacity: number;
}

export interface BikeDefinition {
  id: BikeId;
  name: string;
  bikeClass: string;
  description: string;
  stats: BikeStats;
  colors: { primary: string; secondary: string; accent: string };
}

export interface BikeInput {
  throttle: number;
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  nitro: boolean;
  wheelie: boolean;
  punch: boolean;
  kick: boolean;
  /** Swing the held weapon (ignored when not holding one). */
  weapon: boolean;
  block: boolean;
}

export type AttackKind = 'punch' | 'kick' | 'weapon';
export type WeaponId = 'bat' | 'chain';

/** Per-rider combat state. Owned and mutated only by the simulation (never by client input). */
export interface CombatState {
  attack: AttackKind | null;
  /** Weapon used by the current swing (kept even if it breaks mid-swing). */
  attackWeapon: WeaponId | null;
  attackTimer: number;
  attackResolved: boolean;
  attackSide: 1 | -1;
  attackTargetId: string | null;
  /** Increments every attack; lets observers distinguish consecutive swings. */
  attackSeq: number;
  cooldowns: Record<AttackKind, number>;
  blocking: boolean;
  /** Seconds of reduced control after taking a hit. */
  stagger: number;
  /** Lateral knockback velocity (m/s), decays over time. */
  knockbackV: number;
  /** Immunity to combat after respawn. */
  shield: number;
  weapon: WeaponId | null;
  weaponUses: number;
  lastHitBy: string | null;
  lastHitTime: number;
  hitFlash: number;
  hitsLanded: number;
  knockouts: number;
  damageDealt: number;
}

export interface PickupState {
  id: number;
  s: number;
  d: number;
  weapon: WeaponId;
  active: boolean;
  respawnTimer: number;
}

export type TrafficKind = 'car' | 'sport' | 'van' | 'bus' | 'truck';

export interface TrafficVehicle {
  id: number;
  kind: TrafficKind;
  /** Distance along the track centerline (m). */
  s: number;
  /** Lateral offset from centerline (m), positive = right. */
  d: number;
  prevS: number;
  prevD: number;
  lane: number;
  targetLane: number;
  speed: number;
  baseSpeed: number;
  dir: 1 | -1;
  length: number;
  width: number;
  height: number;
  color: number;
  laneChangeCooldown: number;
  active: boolean;
  /** Incremented whenever the vehicle is recycled so renderers can detect teleports. */
  serial: number;
}

export interface RacerAIState {
  targetD: number;
  decisionTimer: number;
  skill: number;
  nitroBias: number;
  /** 0..1 how eager the rider is to fight. */
  aggression: number;
  combatTimer: number;
  /** Identifies the incoming attack the AI already decided how to react to. */
  threatKey: string | null;
  blockThreat: boolean;
}

export interface RacerState {
  id: string;
  name: string;
  bikeId: BikeId;
  isHuman: boolean;
  color: string;
  s: number;
  d: number;
  prevS: number;
  prevD: number;
  /** Forward speed (m/s). */
  v: number;
  /** Heading relative to road tangent (rad), positive = right. */
  yaw: number;
  /** Visual lean (rad), positive = right. */
  lean: number;
  /** Wheelie amount 0..1. */
  wheelie: number;
  wheelieTime: number;
  health: number;
  maxHealth: number;
  nitro: number;
  nitroActive: boolean;
  offroad: boolean;
  crashed: boolean;
  crashTimer: number;
  invulnerable: number;
  finished: boolean;
  finishTime: number | null;
  place: number;
  score: number;
  combo: number;
  comboTimer: number;
  nearMisses: number;
  wrecks: number;
  collisions: number;
  topSpeed: number;
  throttle: number;
  braking: boolean;
  speedScale: number;
  combat: CombatState;
  ai?: RacerAIState;
}

export type RacePhase = 'countdown' | 'racing' | 'finished';

export type RaceEvent =
  | { type: 'countdown'; value: number }
  | { type: 'collision'; racerId: string; impact: number; damage: number; s: number; d: number; vehicleKind: TrafficKind }
  | { type: 'barrier'; racerId: string; impact: number; s: number; d: number; side: 1 | -1 }
  | { type: 'nearMiss'; racerId: string; bonus: number; combo: number }
  | { type: 'wreck'; racerId: string; s: number; d: number }
  | { type: 'respawn'; racerId: string }
  | { type: 'finish'; racerId: string; place: number; time: number }
  | { type: 'nitro'; racerId: string; active: boolean }
  | { type: 'stunt'; racerId: string; points: number; label: string }
  | { type: 'bikeBump'; a: string; b: string; impact: number }
  | { type: 'attack'; racerId: string; kind: AttackKind; weapon: WeaponId | null; side: 1 | -1 }
  | { type: 'attackMiss'; racerId: string; kind: AttackKind }
  | {
      type: 'hit';
      attackerId: string;
      targetId: string;
      kind: AttackKind;
      weapon: WeaponId | null;
      damage: number;
      blocked: boolean;
      side: 1 | -1;
      s: number;
      d: number;
    }
  | { type: 'pickup'; racerId: string; weapon: WeaponId; pickupId: number }
  | { type: 'weaponBreak'; racerId: string; weapon: WeaponId }
  | { type: 'knockout'; attackerId: string; targetId: string };
