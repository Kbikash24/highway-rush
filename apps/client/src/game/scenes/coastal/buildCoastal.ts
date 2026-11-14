import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng, createTrackSample, ROAD, type Track } from '@highway-rush/shared';

const sample = createTrackSample();

/** Cheap deterministic 1D value noise in [-1, 1]. */
function noise1(x: number, seed: number) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const t = f * f * (3 - 2 * f);
  return h(i) * (1 - t) + h(i + 1) * t;
}

export function computeSeaLevel(track: Track) {
  let minY = Infinity;
  for (let s = track.sMin; s <= track.sMax; s += 10) minY = Math.min(minY, track.sample(s, sample).y);
  return minY - 9;
}

/** Terrain height relative to world at road distance s and lateral offset d. */
export function terrainHeight(s: number, d: number, roadY: number, sea: number): number {
  const n = noise1(s / 60, 1) * 0.6 + noise1(s / 23, 2) * 0.4;
  if (d < 0) {
    const a = -d;
    if (a <= 9.6) return roadY - 0.25;
    if (a <= 12) return roadY - 0.25 - ((a - 9.6) / 2.4) * 1.2;
    if (a <= 20) return THREE.MathUtils.lerp(roadY - 1.45, Math.max(sea + 2, (roadY + sea) / 2), (a - 12) / 8);
    if (a <= 32) return THREE.MathUtils.lerp(Math.max(sea + 2, (roadY + sea) / 2), sea + 1.6 + n * 0.4, (a - 20) / 12);
    if (a <= 48) return THREE.MathUtils.lerp(sea + 1.6 + n * 0.4, sea + 0.7, (a - 32) / 16);
    if (a <= 62) return THREE.MathUtils.lerp(sea + 0.7, sea - 0.6, (a - 48) / 14);
    return THREE.MathUtils.lerp(sea - 0.6, sea - 5, Math.min(1, (a - 62) / 40));
  }
  if (d <= 9.6) return roadY - 0.25;
  if (d <= 12) return roadY - 0.25 + ((d - 9.6) / 2.4) * 0.6;
  const rise = Math.pow((d - 12) / 150, 0.8);
  return roadY + 0.35 + rise * (62 + n * 14) + noise1(d / 17 + s / 40, 3) * Math.min(1, (d - 12) / 20) * 2.5;
}

const LEFT_COLUMNS = [-200, -110, -80, -62, -55, -48, -40, -32, -26, -20, -16, -12, -9.6];
const RIGHT_COLUMNS = [9.6, 12, 15, 20, 28, 38, 52, 70, 95, 125, 162];

const COLORS = {
  sand: new THREE.Color('#d9bf8c'),
  wetSand: new THREE.Color('#9c8460'),
  scrub: new THREE.Color('#7d8a4a'),
  grass: new THREE.Color('#58702f'),
  darkGrass: new THREE.Color('#3f5525'),
  rock: new THREE.Color('#8a7663'),
  cliff: new THREE.Color('#6e5b4b'),
};

function terrainColor(out: THREE.Color, y: number, sea: number, d: number, steep: number, jitter: number) {
  const above = y - sea;
  if (above < -0.2) out.copy(COLORS.wetSand);
  else if (above < 1.4) out.copy(COLORS.sand);
  else if (steep > 0.9) out.copy(COLORS.cliff);
  else if (d < 0) out.copy(COLORS.scrub).lerp(COLORS.rock, Math.min(1, steep));
  else if (d > 80) out.copy(COLORS.darkGrass).lerp(COLORS.rock, Math.min(1, steep * 0.8));
  else out.copy(COLORS.grass).lerp(COLORS.rock, Math.min(1, steep * 0.7));
  out.offsetHSL(0, 0, jitter * 0.04);
}

function buildRibbon(track: Track, columns: number[], step: number, sea: number) {
  const rows = Math.floor((track.sMax - track.sMin) / step) + 1;
  const cols = columns.length;
  const pos = new Float32Array(rows * cols * 3);
  const col = new Float32Array(rows * cols * 3);
  const c = new THREE.Color();
  const heights = new Float32Array(cols);
  for (let r = 0; r < rows; r++) {
    const s = track.sMin + r * step;
    const p = track.sample(s, sample);
    for (let k = 0; k < cols; k++) heights[k] = terrainHeight(s, columns[k], p.y, sea);
    for (let k = 0; k < cols; k++) {
      const d = columns[k];
      const i = (r * cols + k) * 3;
      pos[i] = p.x + p.rx * d;
      pos[i + 1] = heights[k];
      pos[i + 2] = p.z + p.rz * d;
      const kn = Math.min(cols - 1, k + 1);
      const kp = Math.max(0, k - 1);
      const steep = Math.abs(heights[kn] - heights[kp]) / Math.max(0.1, Math.abs(columns[kn] - columns[kp]));
      terrainColor(c, heights[k], sea, d, steep, noise1(s / 7 + k * 13, 5));
      col[i] = c.r;
      col[i + 1] = c.g;
      col[i + 2] = c.b;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < cols - 1; k++) {
      const a = r * cols + k;
      const b = a + 1;
      const cc = a + cols;
      const dd = cc + 1;
      idx.push(a, b, cc, b, dd, cc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildTerrain(track: Track, sea: number) {
  const left = buildRibbon(track, LEFT_COLUMNS, 8, sea);
  const right = buildRibbon(track, RIGHT_COLUMNS, 8, sea);
  const merged = mergeGeometries([left, right])!;
  left.dispose();
  right.dispose();
  return merged;
}

export const ROAD_HALF_SPAN = 9.6;
export const ROAD_TEXTURE_LENGTH = 24;

export function buildRoad(track: Track) {
  const step = 3;
  const rows = Math.floor((track.sMax - track.sMin) / step) + 1;
  const pos = new Float32Array(rows * 2 * 3);
  const uv = new Float32Array(rows * 2 * 2);
  for (let r = 0; r < rows; r++) {
    const s = track.sMin + r * step;
    const p = track.sample(s, sample);
    for (let k = 0; k < 2; k++) {
      const d = k === 0 ? -ROAD_HALF_SPAN : ROAD_HALF_SPAN;
      const i = (r * 2 + k) * 3;
      pos[i] = p.x + p.rx * d;
      pos[i + 1] = p.y;
      pos[i + 2] = p.z + p.rz * d;
      uv[(r * 2 + k) * 2] = k;
      uv[(r * 2 + k) * 2 + 1] = s / ROAD_TEXTURE_LENGTH;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    const a = r * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Guard rail beams on both sides as one ribbon geometry (two strips per side). */
export function buildRails(track: Track) {
  const step = 4;
  const rows = Math.floor((track.sMax - track.sMin) / step) + 1;
  const geos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const d = side * ROAD.barrierOffset;
    const pos = new Float32Array(rows * 4 * 3);
    for (let r = 0; r < rows; r++) {
      const s = track.sMin + r * step;
      const p = track.sample(s, sample);
      const heights = [0.5, 0.72, 0.72, 0.84];
      const offs = [0, 0, side * 0.12, side * 0.12];
      for (let k = 0; k < 4; k++) {
        const i = (r * 4 + k) * 3;
        pos[i] = p.x + p.rx * (d + offs[k]);
        pos[i + 1] = p.y + heights[k];
        pos[i + 2] = p.z + p.rz * (d + offs[k]);
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let k = 0; k < 3; k++) {
        const a = r * 4 + k;
        idx.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
  }
  const merged = mergeGeometries(geos)!;
  geos.forEach((g) => g.dispose());
  return merged;
}

export interface PropTransforms {
  matrices: THREE.Matrix4[];
  colors?: THREE.Color[];
}

function placeOnTrack(track: Track, s: number, d: number, y: number, yaw: number, scale: THREE.Vector3, tilt = 0) {
  const p = track.sample(s, sample);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, Math.atan2(-p.tx, -p.tz) + yaw, tilt * 0.5, 'YXZ'));
  m.compose(new THREE.Vector3(p.x + p.rx * d, y, p.z + p.rz * d), q, scale);
  return m;
}

export interface CoastalProps {
  posts: THREE.Matrix4[];
  lampPoles: THREE.Matrix4[];
  lampHeads: THREE.Matrix4[];
  palmTrunks: THREE.Matrix4[];
  palmCrowns: THREE.Matrix4[];
  cypress: THREE.Matrix4[];
  rocks: THREE.Matrix4[];
  mountains: THREE.Matrix4[];
  islands: THREE.Matrix4[];
  billboards: Array<{ position: THREE.Vector3; rotationY: number; label: string; accent: string }>;
}

export function buildCoastalProps(track: Track, sea: number, density: number): CoastalProps {
  const rng = createRng(1337);
  const out: CoastalProps = { posts: [], lampPoles: [], lampHeads: [], palmTrunks: [], palmCrowns: [], cypress: [], rocks: [], mountains: [], islands: [], billboards: [] };
  const one = new THREE.Vector3(1, 1, 1);

  for (let s = track.sMin; s < track.sMax; s += 4) {
    for (const side of [-1, 1]) {
      const p = track.sample(s, sample);
      out.posts.push(placeOnTrack(track, s, side * (ROAD.barrierOffset + side * 0.08), p.y, 0, one));
    }
  }

  for (let s = track.sMin + 30; s < track.sMax; s += 70) {
    const p = track.sample(s, sample);
    out.lampPoles.push(placeOnTrack(track, s, 10.3, p.y, 0, one));
    out.lampHeads.push(placeOnTrack(track, s, 10.3, p.y, 0, one));
  }

  const palmStep = 18 / density;
  for (let s = track.sMin; s < track.sMax; s += palmStep * rng.range(0.6, 1.4)) {
    const d = -rng.range(24, 46);
    const p = track.sample(s, sample);
    const y = terrainHeight(s, d, p.y, sea);
    if (y < sea + 0.4) continue;
    const scale = rng.range(0.8, 1.25);
    const tilt = rng.range(-0.18, 0.18);
    const yaw = rng.range(0, Math.PI * 2);
    out.palmTrunks.push(placeOnTrack(track, s, d, y, yaw, new THREE.Vector3(scale, scale, scale), tilt));
    out.palmCrowns.push(placeOnTrack(track, s, d, y, yaw, new THREE.Vector3(scale, scale, scale), tilt));
  }

  const treeStep = 9 / density;
  for (let s = track.sMin; s < track.sMax; s += treeStep * rng.range(0.5, 1.5)) {
    const d = rng.range(16, 140);
    const p = track.sample(s, sample);
    const y = terrainHeight(s, d, p.y, sea);
    const h = rng.range(0.7, 1.6);
    out.cypress.push(placeOnTrack(track, s, d, y - 0.3, rng.range(0, 6), new THREE.Vector3(h * rng.range(0.8, 1.1), h, h)));
  }

  const rockStep = 14 / density;
  for (let s = track.sMin; s < track.sMax; s += rockStep * rng.range(0.5, 1.5)) {
    const right = rng.chance(0.6);
    const d = right ? rng.range(13, 90) : -rng.range(14, 70);
    const p = track.sample(s, sample);
    const y = terrainHeight(s, d, p.y, sea);
    const k = rng.range(0.6, right ? 3.5 : 2.5);
    out.rocks.push(placeOnTrack(track, s, d, y - k * 0.3, rng.range(0, 6), new THREE.Vector3(k * rng.range(0.8, 1.6), k, k * rng.range(0.8, 1.4))));
  }

  for (let s = track.sMin; s < track.sMax + 400; s += 160) {
    const p = track.sample(Math.min(s, track.sMax), sample);
    const d = rng.range(230, 520);
    const h = rng.range(90, 220);
    out.mountains.push(placeOnTrack(track, Math.min(s, track.sMax), d, p.y - 5, rng.range(0, 6), new THREE.Vector3(h * rng.range(0.9, 1.6), h, h * rng.range(0.9, 1.4))));
  }

  for (let s = track.sMin; s < track.sMax; s += 420) {
    const d = -rng.range(300, 650);
    const h = rng.range(20, 70);
    out.islands.push(placeOnTrack(track, s, d, sea - 4, rng.range(0, 6), new THREE.Vector3(h * rng.range(1.5, 3), h, h * rng.range(1.2, 2.5))));
  }

  const ads = [
    { label: 'HIGHWAY RUSH', accent: '#ff3d5a' },
    { label: 'VOLT ENERGY', accent: '#a3e635' },
    { label: 'APEX TYRES', accent: '#38bdf8' },
    { label: 'NITRO FUEL', accent: '#f59e0b' },
  ];
  let ad = 0;
  for (let s = 400; s < track.raceLength; s += 650) {
    const p = track.sample(s, sample);
    const d = 15;
    out.billboards.push({
      position: new THREE.Vector3(p.x + p.rx * d, p.y, p.z + p.rz * d),
      // Face back toward approaching riders, angled slightly toward the road.
      rotationY: Math.atan2(-p.tx, -p.tz) - 0.35,
      ...ads[ad++ % ads.length],
    });
  }

  return out;
}

export function buildPalmCrownGeometry() {
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.BoxGeometry(0.5, 0.06, 3.2);
    leaf.translate(0, 0, 1.5);
    leaf.rotateX(0.45);
    leaf.rotateY((i / 7) * Math.PI * 2);
    leaves.push(leaf);
  }
  const ball = new THREE.SphereGeometry(0.45, 6, 5);
  const merged = mergeGeometries([...leaves, ball])!;
  // Matches the trunk's top (curved +0.9 in x).
  merged.translate(0.9, 7.2, 0);
  leaves.forEach((l) => l.dispose());
  ball.dispose();
  return merged;
}

export function buildPalmTrunkGeometry() {
  const g = new THREE.CylinderGeometry(0.17, 0.3, 7.4, 7, 6);
  g.translate(0, 3.7, 0);
  // Gentle curve.
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + Math.pow(y / 7.4, 2) * 0.9);
  }
  g.computeVertexNormals();
  return g;
}
