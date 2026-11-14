import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameSession } from '../session/GameSession';
import { useDisposable } from '../scenes/sceneUtils';

const COUNT = 70;

/** Camera-space streaks that intensify with speed and nitro. */
export function SpeedLines({ session }: { session: GameSession }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((s) => s.camera);
  const lines = useMemo(
    () =>
      Array.from({ length: COUNT }, () => ({
        angle: Math.random() * Math.PI * 2,
        radius: 2.2 + Math.random() * 4,
        z: -Math.random() * 60,
        len: 2 + Math.random() * 5,
      })),
    [],
  );
  const res = useDisposable(() => {
    const geometry = new THREE.BoxGeometry(0.025, 0.025, 1);
    const material = new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    return { geometry, material, dispose: () => (geometry.dispose(), material.dispose()) };
  }, []);
  const obj = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, dt) => {
    const g = group.current;
    const m = mesh.current;
    if (!g || !m) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    const p = session.player;
    const intensity = Math.max(0, Math.min(1, (p.v - 40) / 40)) * 0.35 + (p.nitroActive ? 0.55 : 0);
    res.material.opacity += (intensity - res.material.opacity) * Math.min(1, dt * 6);
    res.material.color.set(p.nitroActive ? '#7dd3fc' : '#ffffff');
    g.visible = res.material.opacity > 0.01;
    if (!g.visible || session.paused) return;
    const speed = p.v * 1.6 + 20;
    for (let i = 0; i < COUNT; i++) {
      const l = lines[i];
      l.z += speed * dt;
      if (l.z > 2) {
        l.z = -60 + Math.random() * 10;
        l.angle = Math.random() * Math.PI * 2;
      }
      obj.position.set(Math.cos(l.angle) * l.radius, Math.sin(l.angle) * l.radius * 0.7, l.z);
      obj.scale.set(1, 1, l.len * (0.5 + intensity));
      obj.updateMatrix();
      m.setMatrixAt(i, obj.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[res.geometry, res.material, COUNT]} frustumCulled={false} />
    </group>
  );
}
