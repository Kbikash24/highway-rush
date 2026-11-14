import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  matrices: THREE.Matrix4[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** Static instanced props: matrices are uploaded once. */
export function StaticInstances({ matrices, geometry, material, castShadow, receiveShadow }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);
  if (!matrices.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled={false} />;
}

/** Disposes GPU resources created outside of JSX when the owning component unmounts. */
export function useDisposable<T extends { dispose: () => void }>(factory: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(factory, deps);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** Keeps an object centred under the camera on the XZ plane, snapped so tiled textures stay seamless. */
export function FollowCamera({ children, y, snap }: { children: React.ReactNode; y: number; snap: number }) {
  const ref = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.set(Math.round(camera.position.x / snap) * snap, y, Math.round(camera.position.z / snap) * snap);
  });
  return <group ref={ref}>{children}</group>;
}
