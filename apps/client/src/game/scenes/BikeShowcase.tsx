import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { BIKES, type BikeId } from '@highway-rush/shared';
import { BikeModel, useBikeRig } from '../bikes/BikeModel';

function Turntable({ bikeId }: { bikeId: BikeId }) {
  const group = useRef<THREE.Group>(null);
  const rig = useBikeRig();
  const bike = BIKES[bikeId];
  useFrame((state, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.35;
    const t = state.clock.elapsedTime;
    if (rig.frontWheel.current) rig.frontWheel.current.rotation.x = -t * 2;
    if (rig.rearWheel.current) rig.rearWheel.current.rotation.x = -t * 2;
  });
  return (
    <group ref={group} position={[0, -0.9, 0]}>
      <BikeModel colors={{ ...bike.colors, suit: '#1f2937' }} rig={rig} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]}>
        <ringGeometry args={[1.55, 1.62, 64]} />
        <meshBasicMaterial color={bike.colors.primary} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function BikeShowcase({ bikeId, className }: { bikeId: BikeId; className?: string }) {
  return (
    <Canvas className={className} dpr={[1, 2]} camera={{ position: [3.2, 1.1, 3.4], fov: 35 }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.4} />
      <spotLight position={[4, 6, 3]} angle={0.5} penumbra={0.8} intensity={60} castShadow />
      <pointLight position={[-3, 1.5, -2]} intensity={25} color="#ff3d5a" />
      <pointLight position={[3, 0.5, -3]} intensity={18} color="#22d3ee" />
      <Turntable bikeId={bikeId} />
      <ContactShadows position={[0, -0.9, 0]} opacity={0.65} scale={6} blur={2.4} far={2} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={2} color="#ff3d5a" position={[-4, 1, 0]} rotation-y={Math.PI / 2} scale={[4, 1, 1]} />
        <Lightformer form="rect" intensity={2} color="#22d3ee" position={[4, 1, 0]} rotation-y={-Math.PI / 2} scale={[4, 1, 1]} />
      </Environment>
    </Canvas>
  );
}
