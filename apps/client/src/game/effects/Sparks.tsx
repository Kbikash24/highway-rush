import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createTrackSample } from '@highway-rush/shared';
import type { GameSession } from '../session/GameSession';
import { useDisposable } from '../scenes/sceneUtils';

const MAX = 400;

/** Pooled particle system for sparks, debris and dust driven by simulation events. */
export function Sparks({ session }: { session: GameSession }) {
  const points = useRef<THREE.Points>(null);
  const pool = useMemo(
    () => ({
      pos: new Float32Array(MAX * 3),
      col: new Float32Array(MAX * 3),
      vel: new Float32Array(MAX * 3),
      life: new Float32Array(MAX),
      maxLife: new Float32Array(MAX),
      base: new Float32Array(MAX * 3),
      next: 0,
    }),
    [],
  );
  const res = useDisposable(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pool.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(pool.col, 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    return { geometry, material, dispose: () => (geometry.dispose(), material.dispose()) };
  }, [pool]);

  useEffect(() => {
    const scratch = createTrackSample();
    const world = new THREE.Vector3();
    const color = new THREE.Color();
    const emit = (s: number, d: number, h: number, count: number, speed: number, palette: string[], life: number, forward: number) => {
      const t = session.sim.track;
      t.toWorld(s, d, h, world, scratch);
      const fx = scratch.tx * forward;
      const fz = scratch.tz * forward;
      for (let i = 0; i < count; i++) {
        const k = pool.next;
        pool.next = (pool.next + 1) % MAX;
        pool.pos[k * 3] = world.x;
        pool.pos[k * 3 + 1] = world.y;
        pool.pos[k * 3 + 2] = world.z;
        pool.vel[k * 3] = (Math.random() - 0.5) * speed + fx;
        pool.vel[k * 3 + 1] = Math.random() * speed * 0.8;
        pool.vel[k * 3 + 2] = (Math.random() - 0.5) * speed + fz;
        pool.life[k] = pool.maxLife[k] = life * (0.6 + Math.random() * 0.6);
        color.set(palette[(Math.random() * palette.length) | 0]);
        pool.base[k * 3] = color.r;
        pool.base[k * 3 + 1] = color.g;
        pool.base[k * 3 + 2] = color.b;
      }
    };
    const spark = ['#ffd27a', '#ffb347', '#fff1c1', '#ff8a3d'];
    const debris = ['#9ca3af', '#f87171', '#fbbf24', '#e5e7eb'];
    return session.subscribe((e) => {
      switch (e.type) {
        case 'barrier': {
          const r = session.sim.getRacer(e.racerId);
          if (r && Math.random() < 0.6) emit(e.s, e.d, 0.5, e.impact > 4 ? 22 : 3, 4 + e.impact, spark, 0.5, r.v * 0.6);
          break;
        }
        case 'collision': {
          const r = session.sim.getRacer(e.racerId);
          emit(e.s + 1, e.d, 0.8, Math.min(60, 15 + e.impact * 1.5), 6 + e.impact * 0.3, [...spark, ...debris], 0.8, (r?.v ?? 0) * 0.5);
          break;
        }
        case 'wreck':
          emit(e.s, e.d, 0.6, 70, 10, [...spark, ...debris], 1.1, 0);
          break;
        case 'bikeBump':
          if (e.impact > 3) {
            const r = session.sim.getRacer(e.a);
            if (r) emit(r.s, r.d, 0.6, 12, 5, spark, 0.4, r.v * 0.7);
          }
          break;
        case 'hit': {
          const t = session.sim.getRacer(e.targetId);
          const palette = e.blocked ? ['#7dd3fc', '#e0f2fe', '#38bdf8'] : ['#ffffff', '#fde68a', '#fb7185', '#fbbf24'];
          emit(e.s, e.d - e.side * 0.3, 1.3, e.blocked ? 14 : e.kind === 'weapon' ? 30 : 20, e.blocked ? 4 : 6, palette, 0.45, (t?.v ?? 0) * 0.9);
          break;
        }
        case 'pickup': {
          const r = session.sim.getRacer(e.racerId);
          if (r) emit(r.s, r.d, 1.1, 24, 5, ['#ffb020', '#fde68a', '#ffffff'], 0.6, r.v * 0.9);
          break;
        }
      }
    });
  }, [session, pool]);

  useFrame((_, rawDt) => {
    if (session.paused) return;
    const dt = Math.min(rawDt, 0.05);
    let alive = false;
    for (let k = 0; k < MAX; k++) {
      if (pool.life[k] <= 0) continue;
      alive = true;
      pool.life[k] -= dt;
      const i = k * 3;
      pool.vel[i + 1] -= 18 * dt;
      pool.pos[i] += pool.vel[i] * dt;
      pool.pos[i + 1] += pool.vel[i + 1] * dt;
      pool.pos[i + 2] += pool.vel[i + 2] * dt;
      const f = Math.max(0, pool.life[k] / pool.maxLife[k]);
      pool.col[i] = pool.base[i] * f;
      pool.col[i + 1] = pool.base[i + 1] * f;
      pool.col[i + 2] = pool.base[i + 2] * f;
      if (pool.life[k] <= 0) pool.col[i] = pool.col[i + 1] = pool.col[i + 2] = 0;
    }
    if (alive) {
      res.geometry.attributes.position.needsUpdate = true;
      res.geometry.attributes.color.needsUpdate = true;
    }
  });

  return <points ref={points} geometry={res.geometry} material={res.material} frustumCulled={false} />;
}
