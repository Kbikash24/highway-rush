import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ATTACKS, BIKES, WEAPONS, createTrackSample, damp, findTarget, type RacerState } from '@highway-rush/shared';
import type { GameSession } from '../session/GameSession';
import { BikeModel, useBikeRig } from './BikeModel';
import { poseRider } from './combatAnimation';
import { useDisposable } from '../scenes/sceneUtils';

function createNameTag(name: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = color;
  ctx.fillRect(0, 8, 8, 48);
  ctx.font = '700 30px Orbitron, Rajdhani, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), 132, 33, 230);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  return { material, dispose: () => (texture.dispose(), material.dispose()) };
}

function RacerBike({ session, racer }: { session: GameSession; racer: RacerState }) {
  const root = useRef<THREE.Group>(null);
  const leanGroup = useRef<THREE.Group>(null);
  const tag = useDisposable(() => createNameTag(racer.name, racer.color), [racer.name, racer.color]);
  const rig = useBikeRig();
  const reachMarker = useRef<THREE.Mesh>(null);
  const anim = useRef({ crashT: 0, spin: 0, wheel: 0, lean: 0, wheelie: 0 });
  const scratch = useMemo(() => createTrackSample(), []);
  const bike = BIKES[racer.bikeId];
  const colors = useMemo(
    () => ({ primary: racer.color, secondary: bike.colors.secondary, accent: bike.colors.accent, suit: racer.isHuman ? '#1f2937' : racer.color }),
    [racer.color, racer.isHuman, bike],
  );

  useFrame((state, dt) => {
    const g = root.current;
    const lg = leanGroup.current;
    if (!g || !lg) return;
    const a = session.alpha;
    const s = racer.prevS + (racer.s - racer.prevS) * a;
    const d = racer.prevD + (racer.d - racer.prevD) * a;
    const p = session.sim.track.sample(s, scratch);
    g.position.set(p.x + p.rx * d, p.y, p.z + p.rz * d);
    const c = anim.current;

    if (racer.crashed) {
      c.crashT += dt;
      c.spin += dt * (2 + racer.v * 0.15);
      g.rotation.set(0, Math.atan2(-p.tx, -p.tz) - racer.yaw + c.spin, 0, 'YXZ');
      c.lean += (1.35 * Math.sign(c.spin || 1) - c.lean) * damp(6, dt);
      lg.rotation.z = c.lean;
      lg.position.y = 0.15;
      const rider = rig.rider.current;
      if (rider) {
        const t = Math.min(c.crashT, 1.2);
        rider.position.set(0.6 * t, Math.max(-0.7, Math.sin((t / 1.2) * Math.PI) * 1.4 - t * 0.6), -t * 2.5);
        rider.rotation.set(-t * 5, 0, t * 1.5);
      }
    } else {
      if (c.crashT > 0) {
        c.crashT = 0;
        c.spin = 0;
        c.lean = 0;
        rig.rider.current?.position.set(0, 0, 0);
        rig.rider.current?.rotation.set(0, 0, 0);
        lg.position.y = 0;
      }
      g.rotation.set(Math.asin(p.ty), Math.atan2(-p.tx, -p.tz) - racer.yaw, 0, 'YXZ');
      c.lean += (racer.lean - c.lean) * damp(12, dt);
      const wobble = racer.combat.stagger > 0 ? Math.sin(state.clock.elapsedTime * 28) * 0.18 * Math.min(1, racer.combat.stagger * 3) : 0;
      lg.rotation.z = -c.lean + wobble;
      c.wheelie += (racer.wheelie - c.wheelie) * damp(10, dt);
      if (rig.wheeliePivot.current) rig.wheeliePivot.current.rotation.x = c.wheelie * 0.55;
      if (rig.rider.current) rig.rider.current.position.z = -c.wheelie * 0.05;
    }

    c.wheel -= (racer.v * dt) / 0.33;
    if (rig.frontWheel.current) rig.frontWheel.current.rotation.x = c.wheel;
    if (rig.rearWheel.current) rig.rearWheel.current.rotation.x = c.wheel;

    if (rig.flame.current) {
      rig.flame.current.visible = racer.nitroActive;
      if (racer.nitroActive) rig.flame.current.scale.set(1, 0.8 + Math.random() * 0.6, 1);
    }
    if (rig.tailLight.current) rig.tailLight.current.emissiveIntensity = racer.braking ? 6 : 1.5;
    poseRider(racer, rig, dt, state.clock.elapsedTime);

    // Blink while shielded after a respawn.
    g.visible = !(racer.combat.shield > 0 && !racer.crashed && Math.floor(state.clock.elapsedTime * 12) % 2 === 0);

    if (!racer.isHuman) {
      const player = session.player;
      const gap = racer.s - player.s;
      // Fade with gap ahead, and fade out when the rider is right next to the camera (tag would fill the screen).
      const camDist = state.camera.position.distanceTo(g.position);
      tag.material.opacity = gap > -30 && gap < 160 ? Math.min(1, (160 - gap) / 40, Math.max(0, (camDist - 4) / 3)) : 0;
      const marker = reachMarker.current;
      if (marker) {
        const pc = player.combat;
        const reach = pc.weapon ? WEAPONS[pc.weapon] : ATTACKS.kick;
        marker.visible = !player.crashed && session.sim.phase === 'racing' && findTarget(player, session.sim.racers, reach, 0) === racer;
        marker.position.y = 2.85 + Math.sin(state.clock.elapsedTime * 8) * 0.08;
      }
    }
  });

  return (
    <group ref={root}>
      <group ref={leanGroup}>
        <BikeModel colors={colors} rig={rig} />
      </group>
      {!racer.isHuman && <sprite material={tag.material} position={[0, 2.35, 0]} scale={[1.8, 0.45, 1]} />}
      {!racer.isHuman && (
        <mesh ref={reachMarker} rotation-x={Math.PI} visible={false}>
          <coneGeometry args={[0.18, 0.32, 4]} />
          <meshBasicMaterial color="#ff3d5a" toneMapped={false} fog={false} />
        </mesh>
      )}
    </group>
  );
}

export function RacerBikes({ session }: { session: GameSession }) {
  return (
    <>
      {session.sim.racers.map((r) => (
        <RacerBike key={r.id} session={session} racer={r} />
      ))}
    </>
  );
}
