import { forwardRef, useMemo, type RefObject } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

export interface BikeColors {
  primary: string;
  secondary: string;
  accent: string;
  suit: string;
}

export type RigSide = 'L' | 'R';

export interface BikeRigRefs {
  frontWheel: RefObject<THREE.Group | null>;
  rearWheel: RefObject<THREE.Group | null>;
  wheeliePivot: RefObject<THREE.Group | null>;
  rider: RefObject<THREE.Group | null>;
  flame: RefObject<THREE.Group | null>;
  tailLight: RefObject<THREE.MeshStandardMaterial | null>;
  arms: Record<RigSide, RefObject<THREE.Group | null>>;
  legs: Record<RigSide, RefObject<THREE.Group | null>>;
  weapons: Record<RigSide, { bat: RefObject<THREE.Group | null>; chain: RefObject<THREE.Group | null> }>;
}

const UP = new THREE.Vector3(0, 1, 0);

function Limb({ from, to, r, color }: { from: [number, number, number]; to: [number, number, number]; r: number; color: string }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const length = dir.length();
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
      length,
    };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion} castShadow>
      <capsuleGeometry args={[r, Math.max(0.01, length - r), 4, 8]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
    </mesh>
  );
}

function Wheel({ z, wheelRef, color }: { z: number; wheelRef: RefObject<THREE.Group | null>; color: string }) {
  return (
    <group position={[0, 0.33, z]}>
      <group ref={wheelRef}>
        <mesh rotation-y={Math.PI / 2} castShadow>
          <torusGeometry args={[0.27, 0.075, 10, 24]} />
          <meshStandardMaterial color="#111" roughness={0.9} />
        </mesh>
        <mesh rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.2, 0.2, 0.06, 16]} />
          <meshStandardMaterial color="#2b2f36" metalness={0.8} roughness={0.25} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation-x={(i * Math.PI) / 3}>
            <boxGeometry args={[0.07, 0.4, 0.035]} />
            <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        <mesh position={[0.07, 0, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.15, 0.15, 0.01, 20]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

/** Procedural sport bike with rider. Faces -Z, ground at y = 0. Swap for a GLB later via the same rig refs. */
export const BikeModel = forwardRef<THREE.Group, { colors: BikeColors; rig: BikeRigRefs }>(function BikeModel({ colors, rig }, ref) {
  const { primary, secondary, accent, suit } = colors;
  return (
    <group ref={ref}>
      {/* Pivot around the rear axle for wheelies. */}
      <group ref={rig.wheeliePivot} position={[0, 0.33, 0.72]}>
        <group position={[0, -0.33, -0.72]}>
          <Wheel z={0.72} wheelRef={rig.rearWheel} color={accent} />
          <Wheel z={-0.74} wheelRef={rig.frontWheel} color={accent} />

          {/* Forks */}
          {[-0.11, 0.11].map((x) => (
            <mesh key={x} position={[x, 0.66, -0.66]} rotation-x={-0.42} castShadow>
              <cylinderGeometry args={[0.035, 0.035, 0.75, 8]} />
              <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.2} />
            </mesh>
          ))}
          {/* Swingarm */}
          {[-0.12, 0.12].map((x) => (
            <mesh key={x} position={[x, 0.4, 0.45]} rotation-x={0.12} castShadow>
              <boxGeometry args={[0.04, 0.07, 0.6]} />
              <meshStandardMaterial color={secondary} metalness={0.6} roughness={0.35} />
            </mesh>
          ))}
          {/* Engine */}
          <mesh position={[0, 0.48, 0.0]} castShadow>
            <boxGeometry args={[0.34, 0.34, 0.5]} />
            <meshStandardMaterial color="#2b2f36" metalness={0.7} roughness={0.35} />
          </mesh>
          {/* Main fairing */}
          <RoundedBox args={[0.38, 0.38, 0.95]} radius={0.08} position={[0, 0.7, -0.22]} castShadow>
            <meshStandardMaterial color={primary} metalness={0.55} roughness={0.25} envMapIntensity={1.2} />
          </RoundedBox>
          {/* Nose */}
          <RoundedBox args={[0.34, 0.3, 0.42]} radius={0.1} position={[0, 0.86, -0.62]} rotation-x={0.35} castShadow>
            <meshStandardMaterial color={primary} metalness={0.55} roughness={0.25} />
          </RoundedBox>
          {/* Headlight */}
          <mesh position={[0, 0.84, -0.84]} rotation-x={0.35}>
            <boxGeometry args={[0.22, 0.09, 0.02]} />
            <meshStandardMaterial color="#fff" emissive="#fff6d5" emissiveIntensity={3} toneMapped={false} />
          </mesh>
          {/* Windscreen */}
          <mesh position={[0, 1.04, -0.62]} rotation-x={-0.75}>
            <planeGeometry args={[0.3, 0.26]} />
            <meshStandardMaterial color="#9ec9ff" transparent opacity={0.45} metalness={0.9} roughness={0.05} side={THREE.DoubleSide} />
          </mesh>
          {/* Tank */}
          <RoundedBox args={[0.42, 0.24, 0.5]} radius={0.1} position={[0, 0.93, -0.18]} castShadow>
            <meshStandardMaterial color={primary} metalness={0.55} roughness={0.22} />
          </RoundedBox>
          {/* Stripe */}
          <mesh position={[0, 1.055, -0.18]}>
            <boxGeometry args={[0.08, 0.01, 0.48]} />
            <meshStandardMaterial color={accent} metalness={0.4} roughness={0.3} />
          </mesh>
          {/* Seat */}
          <RoundedBox args={[0.3, 0.1, 0.5]} radius={0.04} position={[0, 0.93, 0.27]} castShadow>
            <meshStandardMaterial color="#0b0b0f" roughness={0.8} />
          </RoundedBox>
          {/* Tail */}
          <RoundedBox args={[0.3, 0.18, 0.42]} radius={0.06} position={[0, 0.97, 0.62]} rotation-x={-0.25} castShadow>
            <meshStandardMaterial color={secondary} metalness={0.5} roughness={0.3} />
          </RoundedBox>
          <mesh position={[0, 1.0, 0.84]}>
            <boxGeometry args={[0.18, 0.06, 0.03]} />
            <meshStandardMaterial ref={rig.tailLight} color="#300" emissive="#ff1a1a" emissiveIntensity={1.5} toneMapped={false} />
          </mesh>
          {/* Exhaust */}
          <mesh position={[0.2, 0.52, 0.62]} rotation-x={Math.PI / 2 - 0.25} castShadow>
            <cylinderGeometry args={[0.07, 0.06, 0.55, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.15} />
          </mesh>
          <group ref={rig.flame} position={[0.2, 0.59, 0.92]} rotation-x={Math.PI / 2 - 0.25} visible={false}>
            <mesh position={[0, 0.35, 0]}>
              <coneGeometry args={[0.1, 0.7, 10, 1, true]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.22, 0]}>
              <coneGeometry args={[0.055, 0.45, 8, 1, true]} />
              <meshBasicMaterial color="#e0f2fe" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
          {/* Handlebar */}
          <mesh position={[0, 1.03, -0.5]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.022, 0.022, 0.7, 8]} />
            <meshStandardMaterial color="#111" metalness={0.6} roughness={0.4} />
          </mesh>

          {/* Rider */}
          <group ref={rig.rider}>
            <Limb from={[0, 1.02, 0.24]} to={[0, 1.38, -0.16]} r={0.17} color={suit} />
            {([-1, 1] as const).map((side) => {
              const key = side === -1 ? 'L' : 'R';
              return (
                <group key={side}>
                  {/* Leg pivots at the hip so it can kick outward. */}
                  <group ref={rig.legs[key]} position={[side * 0.14, 1.0, 0.24]}>
                    <Limb from={[0, 0, 0]} to={[side * 0.1, -0.14, -0.36]} r={0.08} color={secondary} />
                    <Limb from={[side * 0.1, -0.14, -0.36]} to={[side * 0.06, -0.53, -0.06]} r={0.065} color={secondary} />
                    <mesh position={[side * 0.06, -0.55, -0.02]} castShadow>
                      <boxGeometry args={[0.09, 0.1, 0.24]} />
                      <meshStandardMaterial color="#111" />
                    </mesh>
                  </group>
                  {/* Arm pivots at the shoulder for punches, swings and blocks. */}
                  <group ref={rig.arms[key]} position={[side * 0.2, 1.36, -0.13]}>
                    <Limb from={[0, 0, 0]} to={[side * 0.1, -0.22, -0.2]} r={0.06} color={suit} />
                    <Limb from={[side * 0.1, -0.22, -0.2]} to={[side * 0.11, -0.32, -0.37]} r={0.05} color={suit} />
                    <group position={[side * 0.11, -0.32, -0.37]}>
                      <group ref={rig.weapons[key].bat} visible={false}>
                        <mesh position={[0, 0.13, -0.4]} rotation-x={-1.27} castShadow>
                          <cylinderGeometry args={[0.055, 0.025, 0.85, 10]} />
                          <meshStandardMaterial color="#b07a3e" roughness={0.6} />
                        </mesh>
                      </group>
                      <group ref={rig.weapons[key].chain} visible={false}>
                        {Array.from({ length: 7 }, (_, i) => (
                          <mesh key={i} position={[0, 0.04 * i, -0.06 - i * 0.1]} rotation={[0, i % 2 ? Math.PI / 2 : 0, 0]}>
                            <torusGeometry args={[0.045, 0.014, 6, 10]} />
                            <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.25} />
                          </mesh>
                        ))}
                      </group>
                    </group>
                  </group>
                </group>
              );
            })}
            <mesh position={[0, 1.56, -0.28]} castShadow>
              <sphereGeometry args={[0.16, 18, 14]} />
              <meshStandardMaterial color={accent} metalness={0.5} roughness={0.2} />
            </mesh>
            <mesh position={[0, 1.56, -0.28]}>
              <sphereGeometry args={[0.168, 16, 10, Math.PI * 1.5 - 0.9, 1.8, Math.PI * 0.36, Math.PI * 0.26]} />
              <meshStandardMaterial color="#0a0a0a" metalness={0.9} roughness={0.05} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
});

export function useBikeRig(): BikeRigRefs {
  return useMemo(
    () => ({
      frontWheel: { current: null },
      rearWheel: { current: null },
      wheeliePivot: { current: null },
      rider: { current: null },
      flame: { current: null },
      tailLight: { current: null },
      arms: { L: { current: null }, R: { current: null } },
      legs: { L: { current: null }, R: { current: null } },
      weapons: { L: { bat: { current: null }, chain: { current: null } }, R: { bat: { current: null }, chain: { current: null } } },
    }),
    [],
  );
}
