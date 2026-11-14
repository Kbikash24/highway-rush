import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WEAPONS, createTrackSample, type PickupState } from '@highway-rush/shared';
import type { GameSession } from '../session/GameSession';

const scratch = createTrackSample();

function Pickup({ session, pickup }: { session: GameSession; pickup: PickupState }) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const color = WEAPONS[pickup.weapon].color;

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    g.visible = pickup.active && Math.abs(pickup.s - session.player.s) < 400;
    if (!g.visible) return;
    const p = session.sim.track.sample(pickup.s, scratch);
    g.position.set(p.x + p.rx * pickup.d, p.y, p.z + p.rz * pickup.d);
    const t = state.clock.elapsedTime;
    if (spin.current) {
      spin.current.rotation.y = t * 2 + pickup.id;
      spin.current.position.y = 1.1 + Math.sin(t * 3 + pickup.id) * 0.15;
    }
  });

  return (
    <group ref={group} visible={false}>
      <group ref={spin}>
        <mesh castShadow>
          <boxGeometry args={[0.75, 0.75, 0.75]} />
          <meshStandardMaterial color="#1f2937" emissive={color} emissiveIntensity={0.35} metalness={0.4} roughness={0.4} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.8, 0.12, 0.8]} />
          <meshBasicMaterial color="#ffb020" toneMapped={false} />
        </mesh>
        {pickup.weapon === 'bat' ? (
          <mesh rotation-z={0.7} position={[0, 0, 0.42]}>
            <cylinderGeometry args={[0.06, 0.03, 0.7, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
        ) : (
          <mesh position={[0, 0, 0.42]}>
            <torusGeometry args={[0.22, 0.04, 6, 16]} />
            <meshStandardMaterial color={color} metalness={0.9} roughness={0.25} />
          </mesh>
        )}
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.7, 0.9, 32]} />
        <meshBasicMaterial color="#ffb020" transparent opacity={0.7} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Floating weapon crates; state (active/respawn) comes from the simulation. */
export function Pickups({ session }: { session: GameSession }) {
  return (
    <>
      {session.sim.pickups.map((p) => (
        <Pickup key={p.id} session={session} pickup={p} />
      ))}
    </>
  );
}
