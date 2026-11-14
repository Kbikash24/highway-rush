import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TrafficKind } from '@highway-rush/shared';

const PAINT = 0xffffff; // tinted per instance
const GLASS = 0x1b2633;
const TYRE = 0x121212;
const TRIM = 0x2a2a2e;
const CHROME = 0x9aa3ad;

type Part = THREE.BufferGeometry;

function colorize(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function box(w: number, h: number, l: number, x: number, y: number, z: number, color: number): Part {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(x, y, z);
  return colorize(g, color);
}

function wheels(positions: Array<[number, number]>, radius: number, halfTrack: number): Part[] {
  const out: Part[] = [];
  for (const [z] of positions) {
    for (const side of [-1, 1]) {
      const g = new THREE.CylinderGeometry(radius, radius, 0.32, 12);
      g.rotateZ(Math.PI / 2);
      g.translate(side * halfTrack, radius, z);
      out.push(colorize(g, TYRE));
    }
  }
  return out;
}

function lights(halfW: number, y: number, front: number, back: number, wide = 0.38): Part[] {
  return [
    box(wide, 0.16, 0.06, -halfW + wide / 2 + 0.08, y, front - 0.03, 0xfff3c4),
    box(wide, 0.16, 0.06, halfW - wide / 2 - 0.08, y, front - 0.03, 0xfff3c4),
    box(wide, 0.16, 0.06, -halfW + wide / 2 + 0.08, y, back + 0.03, 0xff1a1a),
    box(wide, 0.16, 0.06, halfW - wide / 2 - 0.08, y, back + 0.03, 0xff1a1a),
  ];
}

interface VehicleGeometry {
  body: THREE.BufferGeometry;
  lights: THREE.BufferGeometry;
}

function finalize(body: Part[], light: Part[]): VehicleGeometry {
  const merged = { body: mergeGeometries(body)!, lights: mergeGeometries(light)! };
  body.forEach((g) => g.dispose());
  light.forEach((g) => g.dispose());
  return merged;
}

/** Models face -Z (front at negative z) with the ground at y = 0. */
export function buildVehicleGeometry(kind: TrafficKind): VehicleGeometry {
  switch (kind) {
    case 'car': {
      const L = 4.4;
      return finalize(
        [
          box(1.9, 0.62, L, 0, 0.62, 0, PAINT),
          box(1.66, 0.58, 2.2, 0, 1.2, 0.25, PAINT),
          box(1.7, 0.4, 2.26, 0, 1.17, 0.25, GLASS),
          box(1.94, 0.22, 0.2, 0, 0.42, -L / 2, TRIM),
          box(1.94, 0.22, 0.2, 0, 0.42, L / 2, TRIM),
          ...wheels([[-1.35, 0], [1.35, 0]], 0.36, 0.86),
        ],
        lights(0.95, 0.75, -L / 2, L / 2),
      );
    }
    case 'sport': {
      const L = 4.3;
      return finalize(
        [
          box(1.95, 0.5, L, 0, 0.52, 0, PAINT),
          box(1.6, 0.42, 1.8, 0, 0.98, 0.35, PAINT),
          box(1.64, 0.3, 1.84, 0, 0.95, 0.35, GLASS),
          box(1.9, 0.08, 0.4, 0, 1.15, L / 2 - 0.2, TRIM),
          box(0.1, 0.35, 0.1, -0.7, 0.95, L / 2 - 0.2, TRIM),
          box(0.1, 0.35, 0.1, 0.7, 0.95, L / 2 - 0.2, TRIM),
          ...wheels([[-1.3, 0], [1.35, 0]], 0.34, 0.9),
        ],
        lights(0.97, 0.62, -L / 2, L / 2, 0.45),
      );
    }
    case 'van': {
      const L = 5.2;
      return finalize(
        [
          box(2.1, 1.9, L, 0, 1.3, 0.1, PAINT),
          box(2.0, 0.7, 0.08, 0, 1.75, -L / 2 + 0.06, GLASS),
          box(2.12, 0.55, 1.2, 0, 1.75, -L / 2 + 0.8, GLASS),
          box(2.14, 0.25, L, 0, 0.45, 0.1, TRIM),
          ...wheels([[-1.6, 0], [1.7, 0]], 0.4, 0.95),
        ],
        lights(1.05, 0.8, -L / 2 + 0.05, L / 2 + 0.1),
      );
    }
    case 'bus': {
      const L = 11.5;
      return finalize(
        [
          box(2.6, 2.7, L, 0, 1.85, 0, PAINT),
          box(2.64, 0.95, L - 1.4, 0, 2.35, 0.3, GLASS),
          box(2.4, 1.2, 0.08, 0, 2.2, -L / 2 - 0.02, GLASS),
          box(2.66, 0.3, L, 0, 0.62, 0, TRIM),
          box(2.2, 0.25, 3, 0, 3.3, 1, CHROME),
          ...wheels([[-3.8, 0], [3.2, 0], [4.4, 0]], 0.5, 1.15),
        ],
        lights(1.3, 0.85, -L / 2, L / 2),
      );
    }
    case 'truck': {
      const L = 12.5;
      const cabZ = -L / 2 + 1.35;
      return finalize(
        [
          box(2.5, 2.4, 2.7, 0, 1.75, cabZ, PAINT),
          box(2.3, 0.9, 0.08, 0, 2.3, -L / 2 - 0.02, GLASS),
          box(2.52, 0.6, 1.0, 0, 2.3, cabZ - 0.6, GLASS),
          box(2.6, 3.1, 9.4, 0, 2.15, 1.5, 0xe5e7eb),
          box(2.62, 0.35, 9.4, 0, 0.75, 1.5, TRIM),
          box(0.4, 0.4, 1, 1.15, 0.8, cabZ + 0.4, CHROME),
          ...wheels([[-4.9, 0], [2.6, 0], [3.8, 0], [5.0, 0]], 0.52, 1.15),
        ],
        lights(1.28, 0.9, -L / 2, L / 2),
      );
    }
  }
}
