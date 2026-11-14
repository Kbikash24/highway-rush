import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createTrackSample, type TrafficKind, type TrafficVehicle } from '@highway-rush/shared';
import type { GameSession } from '../session/GameSession';
import { buildVehicleGeometry } from './vehicleGeometry';
import { useDisposable } from '../scenes/sceneUtils';

const KINDS: TrafficKind[] = ['car', 'sport', 'van', 'bus', 'truck'];

function KindInstances({ session, kind, vehicles }: { session: GameSession; kind: TrafficKind; vehicles: TrafficVehicle[] }) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const lightRef = useRef<THREE.InstancedMesh>(null);
  const geo = useDisposable(() => {
    const g = buildVehicleGeometry(kind);
    return { ...g, dispose: () => (g.body.dispose(), g.lights.dispose()) };
  }, [kind]);
  const mats = useDisposable(() => {
    const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45 });
    const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    return { body, lights, dispose: () => (body.dispose(), lights.dispose()) };
  }, []);

  const tmp = useMemo(
    () => ({ obj: new THREE.Object3D(), color: new THREE.Color(), pos: new THREE.Vector3(), sample: createTrackSample(), zero: new THREE.Matrix4().makeScale(0, 0, 0) }),
    [],
  );

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    vehicles.forEach((_, i) => body.setColorAt(i, tmp.color.set(0xffffff)));
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  }, [vehicles, tmp]);

  useFrame(() => {
    const body = bodyRef.current;
    const light = lightRef.current;
    if (!body || !light) return;
    const track = session.sim.track;
    const a = session.alpha;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (!v.active) {
        body.setMatrixAt(i, tmp.zero);
        light.setMatrixAt(i, tmp.zero);
        continue;
      }
      const s = v.prevS + (v.s - v.prevS) * a;
      const d = v.prevD + (v.d - v.prevD) * a;
      const p = track.sample(s, tmp.sample);
      tmp.obj.position.set(p.x + p.rx * d, p.y, p.z + p.rz * d);
      const laneShift = v.targetLane !== v.lane ? Math.sign(v.targetLane - v.lane) * 0.08 : 0;
      tmp.obj.rotation.set(Math.asin(p.ty) * v.dir, Math.atan2(-p.tx, -p.tz) + (v.dir === -1 ? Math.PI : 0) - laneShift * v.dir, 0, 'YXZ');
      tmp.obj.updateMatrix();
      body.setMatrixAt(i, tmp.obj.matrix);
      light.setMatrixAt(i, tmp.obj.matrix);
      body.setColorAt(i, tmp.color.setHex(v.color));
    }
    body.instanceMatrix.needsUpdate = true;
    light.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  });

  if (!vehicles.length) return null;
  return (
    <>
      <instancedMesh ref={bodyRef} args={[geo.body, mats.body, vehicles.length]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={lightRef} args={[geo.lights, mats.lights, vehicles.length]} frustumCulled={false} />
    </>
  );
}

export function TrafficRenderer({ session }: { session: GameSession }) {
  const byKind = useMemo(() => {
    const groups: Record<TrafficKind, TrafficVehicle[]> = { car: [], sport: [], van: [], bus: [], truck: [] };
    for (const v of session.sim.traffic.vehicles) groups[v.kind].push(v);
    return groups;
  }, [session]);
  return (
    <>
      {KINDS.map((k) => (
        <KindInstances key={k} session={session} kind={k} vehicles={byKind[k]} />
      ))}
    </>
  );
}
