import { useEffect, useRef } from 'react';
import { createTrackSample } from '@highway-rush/shared';
import type { GameSession } from '../../game/session/GameSession';

const SIZE = 170;
const BEHIND = 120;
const AHEAD = 420;

/** Heading-up radar showing the road ahead, rivals and nearby traffic. */
export function MiniMap({ session }: { session: GameSession }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = SIZE * dpr;
    c.height = SIZE * dpr;
    const ctx = c.getContext('2d')!;
    const sample = createTrackSample();
    const origin = createTrackSample();
    let raf = 0;
    let last = 0;
    const scale = (SIZE * 0.82) / (AHEAD + BEHIND);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return;
      last = now;
      const track = session.sim.track;
      const p = session.player;
      track.sample(p.s, origin);
      const heading = Math.atan2(origin.tx, -origin.tz);
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      const project = (x: number, z: number): [number, number] => {
        const dx = x - origin.x;
        const dz = z - origin.z;
        const rx = dx * cos + dz * sin;
        const rz = -dx * sin + dz * cos;
        return [SIZE / 2 + rx * scale, SIZE * 0.78 + rz * scale];
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(8,10,18,0.72)';
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Sea side tint
      ctx.lineCap = 'round';
      for (const [width, color] of [
        [11, 'rgba(255,255,255,0.08)'],
        [6, 'rgba(160,170,190,0.55)'],
      ] as const) {
        ctx.beginPath();
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        for (let s = p.s - BEHIND; s <= p.s + AHEAD; s += 10) {
          track.sample(s, sample);
          const [x, y] = project(sample.x, sample.z);
          if (s === p.s - BEHIND) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      const finish = track.raceLength;
      if (finish > p.s - BEHIND && finish < p.s + AHEAD) {
        track.sample(finish, sample);
        const [x, y] = project(sample.x, sample.z);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 6, y - 2, 12, 4);
      }

      for (const v of session.sim.traffic.vehicles) {
        if (!v.active || v.s < p.s - BEHIND || v.s > p.s + AHEAD) continue;
        track.sample(v.s, sample);
        const [x, y] = project(sample.x + sample.rx * v.d, sample.z + sample.rz * v.d);
        ctx.fillStyle = v.dir === 1 ? 'rgba(250,204,21,0.8)' : 'rgba(248,113,113,0.85)';
        ctx.fillRect(x - 1.5, y - 2, 3, 4);
      }

      for (const pk of session.sim.pickups) {
        if (!pk.active || pk.s < p.s - BEHIND || pk.s > p.s + AHEAD) continue;
        track.sample(pk.s, sample);
        const [x, y] = project(sample.x + sample.rx * pk.d, sample.z + sample.rz * pk.d);
        ctx.fillStyle = '#ffb020';
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
        ctx.closePath();
        ctx.fill();
      }

      for (const r of session.sim.racers) {
        if (r.isHuman) continue;
        const s = Math.max(p.s - BEHIND, Math.min(p.s + AHEAD, r.s));
        track.sample(s, sample);
        const [x, y] = project(sample.x + sample.rx * r.d, sample.z + sample.rz * r.d);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = r.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#000';
        ctx.stroke();
      }

      const [px, py] = project(origin.x + origin.rx * p.d, origin.z + origin.rz * p.d);
      ctx.translate(px, py);
      ctx.rotate(p.yaw);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fillStyle = '#ff3d5a';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [session]);

  return <canvas ref={canvas} className="minimap" style={{ width: SIZE, height: SIZE }} />;
}
