import type { TrackDefinition } from '../constants/maps';
import { smoothstep } from './math';

export interface TrackSample {
  x: number;
  y: number;
  z: number;
  /** Unit tangent (direction of travel). */
  tx: number;
  ty: number;
  tz: number;
  /** Horizontal unit vector pointing to the right of the road. */
  rx: number;
  rz: number;
  /** Signed horizontal curvature (1/m); positive = road bends right. */
  curvature: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

const STEP = 2;
export const TRACK_PRE_START = 300;
export const TRACK_RUNOFF = 700;

export function createTrackSample(): TrackSample {
  return { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: -1, rx: 1, rz: 0, curvature: 0 };
}

/**
 * Arc-length parameterised road centerline. The race runs along -Z with lateral and vertical
 * undulation. All gameplay happens in road space (s = distance, d = lateral offset).
 */
export class Track {
  readonly def: TrackDefinition;
  readonly sMin: number;
  readonly sMax: number;
  readonly raceLength: number;
  readonly count: number;
  private readonly px: Float64Array;
  private readonly py: Float64Array;
  private readonly pz: Float64Array;
  private readonly tx: Float64Array;
  private readonly ty: Float64Array;
  private readonly tz: Float64Array;
  private readonly k: Float64Array;

  constructor(def: TrackDefinition) {
    this.def = def;
    this.raceLength = def.raceLength;
    this.sMin = -TRACK_PRE_START;
    this.sMax = def.raceLength + TRACK_RUNOFF;
    const n = Math.ceil((this.sMax - this.sMin) / STEP) + 1;
    this.count = n;
    this.px = new Float64Array(n);
    this.py = new Float64Array(n);
    this.pz = new Float64Array(n);
    this.tx = new Float64Array(n);
    this.ty = new Float64Array(n);
    this.tz = new Float64Array(n);
    this.k = new Float64Array(n);

    const raw = (u: number): [number, number, number] => {
      const ramp = smoothstep(def.straightStart * 0.3, def.straightStart, u);
      let x = 0;
      let y = 0;
      for (const w of def.curves) x += w.amplitude * Math.sin((2 * Math.PI * u) / w.wavelength + w.phase);
      for (const w of def.hills) y += w.amplitude * Math.sin((2 * Math.PI * u) / w.wavelength + w.phase);
      // Offset so the road passes through origin at the start line.
      let x0 = 0;
      let y0 = 0;
      for (const w of def.curves) x0 += w.amplitude * Math.sin(w.phase);
      for (const w of def.hills) y0 += w.amplitude * Math.sin(w.phase);
      return [(x - x0) * ramp, (y - y0) * ramp, -u];
    };

    // Resample the parametric curve at uniform arc-length intervals.
    const du = 0.25;
    let u = this.sMin;
    let prev = raw(u);
    let arc = 0;
    let idx = 0;
    this.store(0, prev[0], prev[1], prev[2]);
    while (idx < n - 1) {
      u += du;
      const p = raw(u);
      const seg = Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
      let target = (idx + 1) * STEP;
      while (arc + seg >= target && idx < n - 1) {
        const t = (target - arc) / seg;
        idx++;
        this.store(idx, prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t, prev[2] + (p[2] - prev[2]) * t);
        target = (idx + 1) * STEP;
      }
      arc += seg;
      prev = p;
    }

    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const dx = this.px[b] - this.px[a];
      const dy = this.py[b] - this.py[a];
      const dz = this.pz[b] - this.pz[a];
      const len = Math.hypot(dx, dy, dz) || 1;
      this.tx[i] = dx / len;
      this.ty[i] = dy / len;
      this.tz[i] = dz / len;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const ha = Math.atan2(this.tx[a], -this.tz[a]);
      const hb = Math.atan2(this.tx[b], -this.tz[b]);
      let dh = hb - ha;
      if (dh > Math.PI) dh -= 2 * Math.PI;
      if (dh < -Math.PI) dh += 2 * Math.PI;
      this.k[i] = dh / ((b - a) * STEP || 1);
    }
  }

  private store(i: number, x: number, y: number, z: number) {
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
  }

  sample(s: number, out: TrackSample = createTrackSample()): TrackSample {
    const f = (Math.min(Math.max(s, this.sMin), this.sMax) - this.sMin) / STEP;
    const i = Math.min(Math.floor(f), this.count - 2);
    const t = f - i;
    const j = i + 1;
    out.x = this.px[i] + (this.px[j] - this.px[i]) * t;
    out.y = this.py[i] + (this.py[j] - this.py[i]) * t;
    out.z = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
    let tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t;
    let ty = this.ty[i] + (this.ty[j] - this.ty[i]) * t;
    let tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
    const len = Math.hypot(tx, ty, tz) || 1;
    tx /= len;
    ty /= len;
    tz /= len;
    out.tx = tx;
    out.ty = ty;
    out.tz = tz;
    const h = Math.hypot(tx, tz) || 1;
    out.rx = -tz / h;
    out.rz = tx / h;
    out.curvature = this.k[i] + (this.k[j] - this.k[i]) * t;
    return out;
  }

  /** Converts road coordinates to world space. */
  toWorld(s: number, d: number, h: number, out: Vec3Like, scratch: TrackSample = createTrackSample()): Vec3Like {
    const p = this.sample(s, scratch);
    out.x = p.x + p.rx * d;
    out.y = p.y + h;
    out.z = p.z + p.rz * d;
    return out;
  }

  /** Yaw (rotation about +Y) that points a -Z-forward model along the road at s. */
  headingAt(s: number, scratch: TrackSample = createTrackSample()): number {
    const p = this.sample(s, scratch);
    return Math.atan2(-p.tx, -p.tz);
  }
}
