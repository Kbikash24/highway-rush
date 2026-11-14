import * as THREE from 'three';
import { currentAttackSpec, damp, type RacerState } from '@highway-rush/shared';
import type { BikeRigRefs, RigSide } from './BikeModel';

type Euler3 = [number, number, number];

const REST: Euler3 = [0, 0, 0];

function approach(obj: THREE.Object3D | null, target: Euler3, k: number) {
  if (!obj) return;
  obj.rotation.x += (target[0] - obj.rotation.x) * k;
  obj.rotation.y += (target[1] - obj.rotation.y) * k;
  obj.rotation.z += (target[2] - obj.rotation.z) * k;
}

/**
 * Poses the rider from simulation combat state: punches/swings rotate the arm outward around the
 * shoulder, kicks swing the leg outward from the hip, blocking raises both forearms.
 * Rotation conventions (rider faces -Z): arm yaw of -side·θ points the arm towards `side`,
 * leg roll of side·θ swings the foot towards `side`, positive pitch raises a limb.
 */
export function poseRider(racer: RacerState, rig: BikeRigRefs, dt: number, time: number) {
  const c = racer.combat;
  const arms: Record<RigSide, Euler3> = { L: REST, R: REST };
  const legs: Record<RigSide, Euler3> = { L: REST, R: REST };
  let torsoRoll = 0;

  if (!racer.crashed) {
    if (c.blocking) {
      arms.L = [1.15, -0.55, 0];
      arms.R = [1.15, 0.55, 0];
    }
    const spec = currentAttackSpec(c);
    if (c.attack && spec) {
      const side = c.attackSide;
      const key: RigSide = side > 0 ? 'R' : 'L';
      const wind = Math.min(1, c.attackTimer / spec.windup);
      const strike = c.attackTimer < spec.windup ? 0 : Math.max(0, 1 - (c.attackTimer - spec.windup) / spec.recovery);
      if (c.attack === 'punch') {
        arms[key] = strike > 0 ? [0.35 * strike, -side * 1.45 * strike, 0] : [0.2 * wind, side * 0.35 * wind, 0];
      } else if (c.attack === 'kick') {
        legs[key] = strike > 0 ? [-0.25 * strike, 0, side * 1.25 * strike] : [0, 0, -side * 0.2 * wind];
      } else {
        arms[key] = strike > 0 ? [0.5 * strike, -side * 1.65 * strike, 0] : [1.6 * wind, side * 0.5 * wind, 0];
      }
      torsoRoll = -side * 0.22 * (strike > 0 ? strike : wind * 0.4);
    }
  }

  const k = damp(30, dt);
  approach(rig.arms.L.current, arms.L, k);
  approach(rig.arms.R.current, arms.R, k);
  approach(rig.legs.L.current, legs.L, k);
  approach(rig.legs.R.current, legs.R, k);

  const rider = rig.rider.current;
  if (rider && !racer.crashed) {
    rider.rotation.z += (torsoRoll - rider.rotation.z) * k;
    // Jolt when hit.
    rider.position.x = c.hitFlash > 0 ? Math.sin(time * 80) * 0.05 * (c.hitFlash / 0.3) : 0;
  }

  const shown = racer.crashed ? null : c.attack === 'weapon' ? c.attackWeapon : c.weapon;
  const hand: RigSide = c.attack === 'weapon' && c.attackSide < 0 ? 'L' : 'R';
  for (const side of ['L', 'R'] as const) {
    const w = rig.weapons[side];
    if (w.bat.current) w.bat.current.visible = shown === 'bat' && side === hand;
    if (w.chain.current) w.chain.current.visible = shown === 'chain' && side === hand;
  }
}
