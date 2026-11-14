import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createTrackSample, damp } from '@highway-rush/shared';
import type { GameSession } from '../session/GameSession';

/** Third-person chase camera computed in road space so it tracks curves and hills smoothly. */
export function ChaseCamera({ session }: { session: GameSession }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const state = useRef({ dist: 14, d: session.player.d, h: 4, roll: 0, fov: 62, lookAhead: 6 });
  const tmp = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), sample: createTrackSample() }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const p = session.player;
    const sim = session.sim;
    const c = state.current;
    const a = session.alpha;
    const s = p.prevS + (p.s - p.prevS) * a;
    const d = p.prevD + (p.d - p.prevD) * a;
    const speedRatio = Math.min(1.3, p.v / 70);
    const intro = sim.phase === 'countdown' ? sim.countdown : 0;

    const targetDist = intro > 0 ? 5.6 + intro * 3 : 5.4 + speedRatio * 1.8 + (p.nitroActive ? 1.1 : 0) + (p.crashed ? 4 : 0);
    const targetH = intro > 0 ? 2.1 + intro * 0.9 : 2.05 + speedRatio * 0.25 + (p.crashed ? 2.5 : 0);
    c.dist += (targetDist - c.dist) * damp(intro > 0 ? 2 : 3.5, dt);
    c.h += (targetH - c.h) * damp(3, dt);
    c.d += (d * 0.88 - c.d) * damp(5, dt);
    c.lookAhead += (6 + p.v * 0.06 - c.lookAhead) * damp(3, dt);

    sim.track.toWorld(s - c.dist, c.d, 0, tmp.pos, tmp.sample);
    tmp.pos.y += c.h;
    sim.track.toWorld(s + c.lookAhead, d * 0.95, 1.05, tmp.look, tmp.sample);

    if (session.shake > 0) {
      const k = session.shake * session.shake * 0.35;
      tmp.pos.x += (Math.random() - 0.5) * k;
      tmp.pos.y += (Math.random() - 0.5) * k;
      tmp.look.x += (Math.random() - 0.5) * k * 0.5;
    }
    if (p.nitroActive) {
      tmp.pos.x += (Math.random() - 0.5) * 0.03;
      tmp.pos.y += (Math.random() - 0.5) * 0.03;
    }

    camera.position.copy(tmp.pos);
    camera.lookAt(tmp.look);
    c.roll += (-p.lean * 0.12 - c.roll) * damp(5, dt);
    camera.rotateZ(c.roll);

    const targetFov = 60 + speedRatio * 14 + (p.nitroActive ? 9 : 0);
    c.fov += (targetFov - c.fov) * damp(4, dt);
    if (Math.abs(camera.fov - c.fov) > 0.01) {
      camera.fov = c.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
