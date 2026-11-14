import { describe, expect, it } from 'vitest';
import { NET, type BikeInput } from '@highway-rush/shared';
import { ClientLimiter, TokenBucket } from '../src/systems/rateLimiter.js';
import { InputQueue } from '../src/systems/inputQueue.js';
import { isOriginAllowed, loadConfig } from '../src/config/env.js';
import { generateRoomCode } from '../src/matchmaking/roomCodes.js';
import { normalizeRoomCode } from '@highway-rush/shared';

const input = (steer = 0): BikeInput => ({ throttle: 1, brake: 0, steer, nitro: false, wheelie: false, punch: false, kick: false, weapon: false, block: false });

describe('TokenBucket / ClientLimiter', () => {
  it('allows a burst, then throttles, then refills over time', () => {
    const bucket = new TokenBucket(10, 5, 0);
    for (let i = 0; i < 5; i++) expect(bucket.take(0)).toBe(true);
    expect(bucket.take(0)).toBe(false);
    expect(bucket.take(500)).toBe(true); // 0.5s * 10/s = 5 tokens back
  });

  it('flags sustained abuse but not a short spike', () => {
    const l = new ClientLimiter(0);
    for (let i = 0; i < 100; i++) l.allow('control', 0); // 16 allowed, 84 dropped: a spike, not abuse
    expect(l.isAbusive(0, 10_000, 150)).toBe(false);
    for (let i = 0; i < 400; i++) l.allow('control', 0);
    expect(l.isAbusive(0, 10_000, 150)).toBe(true);
    expect(l.isAbusive(60_000)).toBe(false); // violations age out
  });
});

describe('InputQueue', () => {
  it('feeds exactly one input per tick and tracks the ack', () => {
    const q = new InputQueue();
    q.push(10, [input(0.1), input(0.2), input(0.3)]);
    expect(q.next()!.steer).toBeCloseTo(0.1);
    expect(q.ack).toBe(10);
    q.next();
    q.next();
    expect(q.ack).toBe(12);
    // Starved queue repeats the last input and the ack does not move.
    expect(q.next()!.steer).toBeCloseTo(0.3);
    expect(q.ack).toBe(12);
  });

  it('stops holding the last input once the client has gone silent', () => {
    const q = new InputQueue();
    q.push(0, [input(0.5)]);
    q.next();
    for (let i = 0; i < 30; i++) expect(q.next()!.throttle).toBe(1);
    expect(q.next()).toMatchObject({ throttle: 0, steer: 0 });
    q.push(1, [input(0.2)]);
    expect(q.next()!.throttle).toBe(1); // resumes as soon as inputs arrive again
  });

  it('ignores replayed or out-of-order sequence numbers', () => {
    const q = new InputQueue();
    q.push(5, [input(), input()]);
    q.push(5, [input(1)]);
    q.push(4, [input(1)]);
    expect(q.length).toBe(2);
    expect(q.dropped).toBe(2);
  });

  it('caps queued inputs so a burst cannot speed-hack or build latency', () => {
    const q = new InputQueue();
    for (let s = 0; s < 400; s += 8) q.push(s, Array.from({ length: 8 }, () => input()));
    expect(q.length).toBeLessThanOrEqual(NET.maxInputQueue);
    // Server consumes one per tick regardless of how many were sent.
    let ticks = 0;
    while (q.length > 0) {
      q.next();
      ticks++;
    }
    expect(ticks).toBeLessThanOrEqual(NET.maxInputQueue);
  });
});

describe('config', () => {
  it('clamps and defaults environment values', () => {
    const c = loadConfig({ PORT: '99999999', CLIENT_ORIGINS: 'https://a.example/ , https://b.example', LOBBY_COUNTDOWN_SECONDS: 'abc' });
    expect(c.port).toBe(65535);
    expect(c.allowedOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(c.lobbyCountdown).toBe(NET.lobbyCountdown);
  });

  it('enforces the origin allowlist (open only when unset)', () => {
    expect(isOriginAllowed('https://evil.example', [])).toBe(true);
    expect(isOriginAllowed('https://evil.example', ['https://game.example'])).toBe(false);
    expect(isOriginAllowed(undefined, ['https://game.example'])).toBe(false);
    expect(isOriginAllowed('https://game.example/', ['https://game.example'])).toBe(true);
  });

  it('generates valid, unambiguous room codes', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(normalizeRoomCode(code)).toBe(code);
    }
  });
});
