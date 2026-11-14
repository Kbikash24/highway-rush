import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { createTrackSample, type Track } from '@highway-rush/shared';
import type { GameSession } from '../../session/GameSession';
import { QUALITY_PRESETS, type Quality } from '../../../store/settingsStore';
import { createBannerTexture, createRoadTexture, createWaterNormalTexture } from '../../effects/textures';
import {
  buildCoastalProps,
  buildPalmCrownGeometry,
  buildPalmTrunkGeometry,
  buildRails,
  buildRoad,
  buildTerrain,
  computeSeaLevel,
  ROAD_HALF_SPAN,
  ROAD_TEXTURE_LENGTH,
} from './buildCoastal';
import { FollowCamera, StaticInstances, useDisposable } from '../sceneUtils';

export const COASTAL_PALETTE = {
  fog: '#d8b6a2',
  sunDirection: new THREE.Vector3(-0.85, 0.2, -0.48).normalize(),
  sunColor: '#ffd2a1',
  hemiSky: '#a9c6ff',
  hemiGround: '#6d5a3c',
};

function SunLight({ session, quality }: { session: GameSession; quality: Quality }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const preset = QUALITY_PRESETS[quality];
  const scratch = useMemo(() => createTrackSample(), []);
  const target = useMemo(() => new THREE.Object3D(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const p = session.player;
    session.sim.track.toWorld(p.s + 15, 0, 0, pos, scratch);
    target.position.copy(pos);
    target.updateMatrixWorld();
    l.position.copy(pos).addScaledVector(COASTAL_PALETTE.sunDirection, 120);
  });
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        color={COASTAL_PALETTE.sunColor}
        intensity={2.6}
        target={target}
        castShadow={preset.shadows}
        shadow-mapSize={[preset.shadowMapSize, preset.shadowMapSize]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={300}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}

function Sea({ y }: { y: number }) {
  const normal = useDisposable(() => {
    const t = createWaterNormalTexture();
    t.repeat.set(200, 200);
    return t;
  }, []);
  const material = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#0f5872',
        roughness: 0.18,
        metalness: 0.35,
        normalMap: normal,
        normalScale: new THREE.Vector2(0.35, 0.35),
      }),
    [normal],
  );
  useFrame((_, dt) => {
    normal.offset.x += dt * 0.012;
    normal.offset.y += dt * 0.007;
  });
  // 8000m / 200 repeats = 40m tiles; snap to the tile size.
  return (
    <FollowCamera y={y} snap={40}>
      <mesh rotation-x={-Math.PI / 2} material={material} receiveShadow={false}>
        <planeGeometry args={[8000, 8000, 1, 1]} />
      </mesh>
    </FollowCamera>
  );
}

function Gate({ track, s, label, kind }: { track: Track; s: number; label: string; kind: 'start' | 'finish' }) {
  const texture = useDisposable(() => createBannerTexture(label, kind), [label, kind]);
  const { position, rotation } = useMemo(() => {
    const p = track.sample(s);
    return { position: new THREE.Vector3(p.x, p.y, p.z), rotation: Math.atan2(-p.tx, -p.tz) };
  }, [track, s]);
  const half = ROAD_HALF_SPAN + 0.6;
  return (
    <group position={position} rotation-y={rotation}>
      {[-half, half].map((x) => (
        <mesh key={x} position={[x, 4, 0]} castShadow>
          <boxGeometry args={[0.8, 8, 0.8]} />
          <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 7.6, 0]} castShadow>
        <boxGeometry args={[half * 2 + 0.8, 2.4, 0.5]} />
        <meshStandardMaterial color="#111827" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 7.6, 0.26]}>
        <planeGeometry args={[half * 2 - 0.4, 2.1]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 7.6, -0.26]} rotation-y={Math.PI}>
        <planeGeometry args={[half * 2 - 0.4, 2.1]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 6.3, 0.26]}>
        <boxGeometry args={[half * 2, 0.08, 0.05]} />
        <meshBasicMaterial color={kind === 'start' ? '#ff3d5a' : '#22d3ee'} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Billboard({ position, rotationY, label, accent }: { position: THREE.Vector3; rotationY: number; label: string; accent: string }) {
  const texture = useDisposable(() => createBannerTexture(label, 'ad', accent), [label, accent]);
  return (
    <group position={position} rotation-y={rotationY}>
      {[-3.5, 3.5].map((x) => (
        <mesh key={x} position={[x, 4, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.22, 8, 8]} />
          <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 9.5, -0.1]} castShadow>
        <boxGeometry args={[12.4, 3.4, 0.2]} />
        <meshStandardMaterial color="#0f0f17" />
      </mesh>
      <mesh position={[0, 9.5, 0.01]}>
        <planeGeometry args={[12, 3]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function CoastalHighway({ session, quality }: { session: GameSession; quality: Quality }) {
  const track = session.sim.track;
  const gl = useThree((s) => s.gl);
  const preset = QUALITY_PRESETS[quality];
  const sea = useMemo(() => computeSeaLevel(track), [track]);

  const roadGeo = useDisposable(() => buildRoad(track), [track]);
  const terrainGeo = useDisposable(() => buildTerrain(track, sea), [track, sea]);
  const railGeo = useDisposable(() => buildRails(track), [track]);
  const roadTex = useDisposable(() => createRoadTexture(ROAD_HALF_SPAN, ROAD_TEXTURE_LENGTH, gl.capabilities.getMaxAnisotropy()), [gl]);
  const props = useMemo(() => buildCoastalProps(track, sea, preset.props), [track, sea, preset.props]);

  const geos = useDisposable(() => {
    const lampPole = new THREE.CylinderGeometry(0.12, 0.18, 9, 6);
    lampPole.translate(0, 4.5, 0);
    const lampHead = new THREE.BoxGeometry(2.6, 0.18, 0.5);
    lampHead.translate(-1.2, 8.9, 0);
    const post = new THREE.BoxGeometry(0.14, 0.9, 0.14);
    post.translate(0, 0.45, 0);
    const cypress = new THREE.ConeGeometry(1.4, 8, 7);
    cypress.translate(0, 4, 0);
    const rock = new THREE.DodecahedronGeometry(1, 0);
    const mountain = new THREE.ConeGeometry(1, 1, 9, 1);
    mountain.translate(0, 0.5, 0);
    const island = new THREE.SphereGeometry(1, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const palmTrunk = buildPalmTrunkGeometry();
    const palmCrown = buildPalmCrownGeometry();
    const all = { lampPole, lampHead, post, cypress, rock, mountain, island, palmTrunk, palmCrown };
    return { ...all, dispose: () => Object.values(all).forEach((g) => g.dispose()) };
  }, []);

  const mats = useDisposable(() => {
    const all = {
      road: new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.88, metalness: 0.02 }),
      terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
      rail: new THREE.MeshStandardMaterial({ color: '#c7ccd3', metalness: 0.75, roughness: 0.3, side: THREE.DoubleSide }),
      post: new THREE.MeshStandardMaterial({ color: '#6b7280', metalness: 0.5, roughness: 0.5 }),
      pole: new THREE.MeshStandardMaterial({ color: '#4b5563', metalness: 0.6, roughness: 0.4 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#1f2937', emissive: '#ffd59a', emissiveIntensity: 0.9 }),
      cypress: new THREE.MeshStandardMaterial({ color: '#2f4a22', roughness: 0.9, flatShading: true }),
      rock: new THREE.MeshStandardMaterial({ color: '#8a7867', roughness: 0.95, flatShading: true }),
      mountain: new THREE.MeshStandardMaterial({ color: '#6f6a7a', roughness: 1, flatShading: true }),
      island: new THREE.MeshStandardMaterial({ color: '#5d6b4a', roughness: 1, flatShading: true }),
      palmTrunk: new THREE.MeshStandardMaterial({ color: '#7a5b3d', roughness: 0.95, flatShading: true }),
      palmCrown: new THREE.MeshStandardMaterial({ color: '#3f7a2c', roughness: 0.85, flatShading: true, side: THREE.DoubleSide }),
    };
    return { ...all, dispose: () => Object.values(all).forEach((m) => m.dispose()) };
  }, [roadTex]);

  return (
    <group>
      <Sky distance={450000} sunPosition={COASTAL_PALETTE.sunDirection.clone().multiplyScalar(1000).toArray()} turbidity={5} rayleigh={1.6} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <fog attach="fog" args={[COASTAL_PALETTE.fog, 140, preset.fogFar]} />
      <hemisphereLight args={[COASTAL_PALETTE.hemiSky, COASTAL_PALETTE.hemiGround, 0.9]} />
      <ambientLight intensity={0.15} />
      <SunLight session={session} quality={quality} />
      <Environment resolution={64} frames={1}>
        <Sky distance={500} sunPosition={COASTAL_PALETTE.sunDirection.clone().multiplyScalar(1000).toArray()} turbidity={5} rayleigh={1.6} />
      </Environment>

      <mesh geometry={roadGeo} material={mats.road} receiveShadow />
      <mesh geometry={terrainGeo} material={mats.terrain} receiveShadow />
      <mesh geometry={railGeo} material={mats.rail} castShadow />
      <Sea y={sea} />

      <StaticInstances matrices={props.posts} geometry={geos.post} material={mats.post} />
      <StaticInstances matrices={props.lampPoles} geometry={geos.lampPole} material={mats.pole} castShadow />
      <StaticInstances matrices={props.lampHeads} geometry={geos.lampHead} material={mats.lamp} />
      <StaticInstances matrices={props.palmTrunks} geometry={geos.palmTrunk} material={mats.palmTrunk} castShadow />
      <StaticInstances matrices={props.palmCrowns} geometry={geos.palmCrown} material={mats.palmCrown} castShadow />
      <StaticInstances matrices={props.cypress} geometry={geos.cypress} material={mats.cypress} castShadow />
      <StaticInstances matrices={props.rocks} geometry={geos.rock} material={mats.rock} castShadow receiveShadow />
      <StaticInstances matrices={props.mountains} geometry={geos.mountain} material={mats.mountain} />
      <StaticInstances matrices={props.islands} geometry={geos.island} material={mats.island} />

      {props.billboards.map((b, i) => (
        <Billboard key={i} {...b} />
      ))}
      <Gate track={track} s={6} label="START" kind="start" />
      <Gate track={track} s={track.raceLength} label="FINISH" kind="finish" />
    </group>
  );
}
