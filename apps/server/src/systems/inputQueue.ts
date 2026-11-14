import { NET, type BikeInput } from '@highway-rush/shared';

interface QueuedInput {
  seq: number;
  input: BikeInput;
}

/** After this many consecutive starved ticks (0.5 s) the rider stops receiving held inputs and coasts. */
export const STARVE_TICKS = 30;
const NEUTRAL: BikeInput = { throttle: 0, brake: 0, steer: 0, nitro: false, wheelie: false, punch: false, kick: false, weapon: false, block: false };

/**
 * Per-player input queue. The server consumes exactly ONE input per simulation tick no matter how
 * many the client sends, so a modified client cannot run its bike faster than real time. Sequence
 * numbers must increase; anything else is dropped.
 */
export class InputQueue {
  private queue: QueuedInput[] = [];
  private lastQueuedSeq = -1;
  /** Sequence number of the last input applied to the simulation. */
  ack = -1;
  private current: BikeInput | null = null;
  private starvedTicks = 0;
  dropped = 0;

  push(firstSeq: number, inputs: readonly BikeInput[]): void {
    inputs.forEach((input, k) => {
      const seq = firstSeq + k;
      if (seq <= this.lastQueuedSeq) {
        this.dropped++;
        return;
      }
      // A gap means the client skipped ticks; accept but remember it so acks stay monotonic.
      this.queue.push({ seq, input });
      this.lastQueuedSeq = seq;
    });
    // If the client burst a lot (lag spike), skip ahead instead of letting latency grow unbounded.
    const excess = this.queue.length - NET.maxInputQueue;
    if (excess > 0) {
      const dropped = this.queue.splice(0, excess);
      this.dropped += dropped.length;
      this.ack = dropped[dropped.length - 1].seq;
      this.current = dropped[dropped.length - 1].input;
    }
  }

  /** The input to simulate this tick; repeats the previous one briefly when the queue ran dry. */
  next(): BikeInput | null {
    const item = this.queue.shift();
    if (item) {
      this.ack = item.seq;
      this.current = item.input;
      this.starvedTicks = 0;
    } else if (++this.starvedTicks > STARVE_TICKS) {
      // Client went silent (tab in background, stalled connection): don't keep holding the throttle.
      return NEUTRAL;
    }
    return this.current;
  }

  get length() {
    return this.queue.length;
  }

  reset() {
    this.queue = [];
    this.lastQueuedSeq = -1;
    this.ack = -1;
    this.current = null;
    this.starvedTicks = 0;
  }
}
