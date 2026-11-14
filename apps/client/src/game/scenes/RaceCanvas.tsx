import { Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameSession } from '../session/GameSession';
import { QUALITY_PRESETS, type Quality } from '../../store/settingsStore';
import { CoastalHighway } from './coastal/CoastalHighway';
import { TrafficRenderer } from '../traffic/TrafficRenderer';
import { RacerBikes } from '../bikes/RacerBikes';
import { ChaseCamera } from '../camera/ChaseCamera';
import { SpeedLines } from '../effects/SpeedLines';
import { Sparks } from '../effects/Sparks';
import { PostFX } from '../effects/PostFX';
import { Pickups } from '../combat/Pickups';

/** Steps the simulation before anything else renders this frame. */
function SessionDriver({ session }: { session: GameSession }) {
  useFrame((_, dt) => session.update(dt), -1);
  return null;
}

export function RaceCanvas({ session, quality }: { session: GameSession; quality: Quality }) {
  const preset = QUALITY_PRESETS[quality];
  return (
    <Canvas
      className="race-canvas"
      shadows={preset.shadows ? { type: THREE.PCFShadowMap } : false}
      dpr={preset.dpr}
      camera={{ fov: 62, near: 0.1, far: 5000, position: [0, 4, 12] }}
      gl={{ antialias: !preset.bloom && quality !== 'low', powerPreference: 'high-performance', stencil: false }}
    >
      <SessionDriver session={session} />
      <Suspense fallback={null}>
        <CoastalHighway session={session} quality={quality} />
      </Suspense>
      <TrafficRenderer session={session} />
      <RacerBikes session={session} />
      <Pickups session={session} />
      <ChaseCamera session={session} />
      <SpeedLines session={session} />
      <Sparks session={session} />
      {preset.bloom && <PostFX />}
    </Canvas>
  );
}
