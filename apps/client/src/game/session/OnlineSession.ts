import {
  BIKES,
  FIXED_DT,
  NET,
  RACER_FIELDS,
  RaceSimulation,
  TICK_RATE,
  TRACKS,
  clamp,
  codeToPhase,
  currentAttackSpec,
  decodePickups,
  decodeRacer,
  decodeTrafficRow,
  isValidSnapshot,
  lerpRacerValues,
  packInput,
  stepBike,
  type BikeInput,
  type NetSnapshot,
  type RaceEvent,
  type RaceResultRow,
  type RaceStartMessage,
  type RacerState,
} from '@highway-rush/shared';
import { input } from '../input/InputManager';
import { network, type NetSessionSink } from '../../multiplayer/network';
import { useNet } from '../../multiplayer/netStore';
import type { RaceResults } from '../../store/gameStore';
import { GameSession } from './GameSession';

interface Buffered {
  /** Server time in seconds. */
  time: number;
  snap: NetSnapshot;
  traffic: Map<number, number[]>;
}

const NEUTRAL: BikeInput = { throttle: 0, brake: 0, steer: 0, nitro: false, wheelie: false, punch: false, kick: false, weapon: false, block: false };
const MAX_STEPS_PER_FRAME = 30;
const MAX_PENDING = 180;
/** Position error above which we snap instead of smoothing (m). */
const SNAP_DISTANCE_S = 6;
const SNAP_DISTANCE_D = 2.5;
const POSITION_FIELDS = 2; // RACER_FIELDS[0..1] are s and d, handled separately.

/**
 * A race whose simulation runs on the server.
 *
 * - Remote riders and traffic are rendered ~110 ms in the past by blending two server snapshots.
 * - The local bike is predicted: every tick the same shared `stepBike` runs on the player's input
 *   immediately, and each snapshot re-bases the bike on the server's state and replays the inputs
 *   the server hasn't processed yet (`ack`). Small disagreements are smoothed away; large ones snap.
 * - Damage, health, hits, traffic collisions, pickups and finishing are never decided here.
 */
export class OnlineSession extends GameSession implements NetSessionSink {
  readonly sim: RaceSimulation;
  readonly playerId: string;
  protected readonly pausable = false;
  protected readonly maxFrameDt = 0.5;

  private readonly myIndex: number;
  private readonly pred: RacerState;
  private pending: Array<{ seq: number; input: BikeInput }> = [];
  private seq = 0;
  private outbox: number[] = [];
  private outboxFirstSeq = 0;
  private tickAcc = 0;
  private buffer: Buffered[] = [];
  private lastTick = -1;
  private clockOffset: number | null = null;
  private started = false;
  private results: RaceResults | null = null;
  private offS = 0;
  private offD = 0;
  private serverPhase = 0;
  private readonly sink: RaceEvent[] = [];

  constructor(start: RaceStartMessage) {
    super();
    const { config, youId } = start;
    const base = TRACKS[config.mapId];
    if (!base) throw new Error(`Map ${config.mapId} is not playable`);
    // Same config + seed as the server => identical traffic slots, kinds and pickup layout.
    this.sim = new RaceSimulation({
      track: { ...base, raceLength: config.raceLength ?? base.raceLength },
      racers: config.racers,
      trafficCount: config.trafficCount,
      seed: config.seed,
      countdownSeconds: config.countdownSeconds,
    });
    this.playerId = youId;
    this.myIndex = config.racers.findIndex((r) => r.id === youId);
    if (this.myIndex < 0) throw new Error('You are not part of this race');
    this.pred = structuredClone(this.sim.racers[this.myIndex]);
  }

  // ---------------------------------------------------------------------------------------------
  // Network input
  // ---------------------------------------------------------------------------------------------

  ingestSnapshot(raw: unknown) {
    if (!isValidSnapshot(raw, this.sim.racers.length)) return;
    const snap = raw;
    if (snap.t <= this.lastTick) return; // out of order / duplicate
    this.lastTick = snap.t;

    const serverTime = snap.t / TICK_RATE;
    const sample = serverTime - performance.now() / 1000;
    this.clockOffset = this.clockOffset === null ? sample : this.clockOffset + (sample - this.clockOffset) * 0.05;

    const traffic = new Map<number, number[]>();
    for (const row of snap.v) traffic.set(row[0], row);
    this.buffer.push({ time: serverTime, snap, traffic });
    while (this.buffer.length > 60 || (this.buffer.length > 2 && serverTime - this.buffer[0].time > 2.5)) this.buffer.shift();

    this.reconcile(snap);
    if (!this.started) {
      this.started = true;
      useNet.getState().set({ waiting: false });
    }
    for (const e of snap.e) this.handleEvent(e);
  }

  onResults(rows: RaceResultRow[]) {
    this.results = { rows, playerId: this.playerId, online: true };
  }

  onReconnected() {
    this.pending = [];
    this.outbox = [];
  }

  protected onSceneReady() {
    network.sendLoaded();
  }

  dispose() {
    network.attachSession(null);
    super.dispose();
  }

  protected pollResults() {
    return this.results;
  }

  // ---------------------------------------------------------------------------------------------
  // Prediction
  // ---------------------------------------------------------------------------------------------

  /** Re-bases the predicted bike on the server's state, then replays unacknowledged inputs. */
  private reconcile(snap: NetSnapshot) {
    const pred = this.pred;
    const first = !this.started;
    const beforeS = pred.s;
    const beforeD = pred.d;
    this.serverPhase = snap.ph;

    decodeRacer(snap.r[this.myIndex], pred);
    this.pending = this.pending.filter((p) => p.seq > snap.a);
    if (snap.ph === 1) for (const p of this.pending) this.predictTick(p.input);

    const errS = beforeS - pred.s;
    const errD = beforeD - pred.d;
    if (first || Math.abs(errS) > SNAP_DISTANCE_S || Math.abs(errD) > SNAP_DISTANCE_D) {
      this.offS = 0;
      this.offD = 0;
    } else {
      // Keep what's on screen continuous; the offset decays over the next few ticks.
      this.offS += errS;
      this.offD += errD;
    }
  }

  /** One fixed tick of local movement, mirroring what the server does for this rider. */
  private predictTick(rawInput: BikeInput) {
    const r = this.pred;
    const c = r.combat;
    const dt = FIXED_DT;
    r.invulnerable = Math.max(0, r.invulnerable - dt);
    r.comboTimer = Math.max(0, r.comboTimer - dt);

    if (r.crashed) {
      r.crashTimer = Math.max(0, r.crashTimer - dt);
      r.v *= Math.exp(-2.2 * dt);
      r.s += r.v * dt;
      return;
    }
    const inp = r.finished ? { ...NEUTRAL, brake: 0.3, steer: clamp(-r.yaw * 2, -1, 1) } : rawInput;
    stepBike(r, inp, BIKES[r.bikeId].stats, this.sim.track, dt, this.sink);
    this.sink.length = 0; // events are announced by the server, never by prediction

    c.stagger = Math.max(0, c.stagger - dt);
    c.hitFlash = Math.max(0, c.hitFlash - dt);
    c.shield = Math.max(0, c.shield - dt);
    c.cooldowns.punch = Math.max(0, c.cooldowns.punch - dt);
    c.cooldowns.kick = Math.max(0, c.cooldowns.kick - dt);
    c.cooldowns.weapon = Math.max(0, c.cooldowns.weapon - dt);
    if (c.attack) {
      c.attackTimer += dt;
      const spec = currentAttackSpec(c);
      if (spec && c.attackTimer >= spec.windup + spec.recovery) c.attack = null;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Frame update
  // ---------------------------------------------------------------------------------------------

  protected advance(dt: number) {
    const latest = this.buffer[this.buffer.length - 1];
    if (!this.started || !latest) return;

    const me = this.sim.racers[this.myIndex];
    this.tickAcc += dt;
    let steps = 0;
    while (this.tickAcc >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.tickAcc -= FIXED_DT;
      steps++;
      // The in-game menu doesn't pause an online race, but the bike shouldn't keep being steered.
      const inp = this.paused ? NEUTRAL : input.sample(FIXED_DT);
      const seq = this.seq++;
      this.pending.push({ seq, input: inp });
      if (this.pending.length > MAX_PENDING) this.pending.shift();
      if (this.outbox.length === 0) this.outboxFirstSeq = seq;
      this.outbox.push(packInput(inp));

      me.prevS = me.s;
      me.prevD = me.d;
      if (this.serverPhase === 1) this.predictTick(inp);
      this.offS *= 0.88;
      this.offD *= 0.88;
      me.s = this.pred.s + this.offS;
      me.d = this.pred.d + this.offD;

      if (this.outbox.length >= NET.inputBatchTicks) this.flushInputs();
    }
    if (steps === MAX_STEPS_PER_FRAME) this.tickAcc = 0;
    this.alpha = this.tickAcc / FIXED_DT;

    // Everything except position comes straight from the predicted state.
    for (let i = POSITION_FIELDS; i < RACER_FIELDS.length; i++) RACER_FIELDS[i].set(me, RACER_FIELDS[i].get(this.pred));

    this.applyWorld(latest);
    this.interpolateRemote();
  }

  private flushInputs() {
    if (this.outbox.length === 0) return;
    network.sendInput(this.outboxFirstSeq, this.outbox);
    this.outbox = [];
  }

  /** Race-wide state that isn't interpolated. */
  private applyWorld(latest: Buffered) {
    const sim = this.sim;
    sim.phase = codeToPhase(latest.snap.ph);
    sim.countdown = latest.snap.cd / 100;
    sim.time = latest.snap.tm / 1000;
    sim.tick = latest.snap.t;
    decodePickups(latest.snap.p, sim.pickups);
  }

  /** Blends the two snapshots surrounding "now minus the interpolation delay". */
  private interpolateRemote() {
    const buf = this.buffer;
    if (buf.length === 0) return;
    const renderTime = performance.now() / 1000 + (this.clockOffset ?? 0) - NET.interpDelay;

    let ia = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i].time <= renderTime) ia = i;
      else break;
    }
    const a = buf[ia];
    const b = buf[Math.min(ia + 1, buf.length - 1)];
    const t = a === b ? 0 : clamp((renderTime - a.time) / (b.time - a.time), 0, 1);

    this.sim.racers.forEach((racer, i) => {
      if (i === this.myIndex) return;
      decodeRacer(lerpRacerValues(a.snap.r[i], b.snap.r[i], t), racer);
      racer.prevS = racer.s;
      racer.prevD = racer.d;
    });

    for (const v of this.sim.traffic.vehicles) {
      const ra = a.traffic.get(v.id);
      const rb = b.traffic.get(v.id);
      const row = ra && rb && Math.abs(rb[1] - ra[1]) < 3000 ? ra.map((x, k) => (k === 1 || k === 2 ? x + (rb[k] - x) * t : rb[k])) : (rb ?? ra);
      if (!row) {
        v.active = false;
        continue;
      }
      decodeTrafficRow(row, v);
      v.prevS = v.s;
      v.prevD = v.d;
    }
  }
}
