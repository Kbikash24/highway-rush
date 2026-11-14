/** Token bucket: `rate` tokens per second up to `burst`. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly rate: number,
    private readonly burst: number,
    now = Date.now(),
  ) {
    this.tokens = burst;
    this.last = now;
  }

  take(now = Date.now(), cost = 1): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

export type LimitKind = 'input' | 'control' | 'ping';

const LIMITS: Record<LimitKind, [rate: number, burst: number]> = {
  // Clients send ~30 input messages/s.
  input: [45, 90],
  control: [8, 16],
  ping: [4, 8],
};

/** Per-client limiter. Persistent abusers are flagged so the room can disconnect them. */
export class ClientLimiter {
  private readonly buckets: Record<LimitKind, TokenBucket>;
  private violations: number[] = [];

  constructor(now = Date.now()) {
    this.buckets = {
      input: new TokenBucket(...LIMITS.input, now),
      control: new TokenBucket(...LIMITS.control, now),
      ping: new TokenBucket(...LIMITS.ping, now),
    };
  }

  /** Returns false when the message must be dropped. */
  allow(kind: LimitKind, now = Date.now()): boolean {
    if (this.buckets[kind].take(now)) return true;
    this.violations.push(now);
    return false;
  }

  /** True after sustained abuse (more than `max` dropped messages in `windowMs`). */
  isAbusive(now = Date.now(), windowMs = 10_000, max = 150): boolean {
    this.violations = this.violations.filter((t) => now - t < windowMs);
    return this.violations.length > max;
  }
}
