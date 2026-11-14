import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Client, type Room } from 'colyseus.js';
import {
  BIKES,
  C2S,
  PROTOCOL_VERSION,
  ROOM_NAME,
  S2C,
  packInput,
  type BikeInput,
  type LobbyState,
  type NetSnapshot,
  type RaceResultRow,
  type RaceStartMessage,
} from '@highway-rush/shared';
import { loadConfig } from '../src/config/env.js';
import { createGameServer, type GameServer } from '../src/server.js';

const PORT = 2591;
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const THROTTLE: BikeInput = { throttle: 1, brake: 0, steer: 0, nitro: false, wheelie: false, punch: false, kick: false, weapon: false, block: false };

/** A real colyseus.js client wrapped with message capture, mimicking what the browser does. */
class TestPlayer {
  room!: Room;
  lobby: LobbyState | null = null;
  start: RaceStartMessage | null = null;
  snaps: NetSnapshot[] = [];
  results: RaceResultRow[] | null = null;
  pongs: number[] = [];
  left = false;
  seq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(public name: string) {}

  private get opts() {
    return { name: this.name, bikeId: 'viper', v: PROTOCOL_VERSION };
  }

  attach(room: Room) {
    this.room = room;
    this.left = false;
    room.onMessage(S2C.lobby, (m: LobbyState) => (this.lobby = m));
    room.onMessage(S2C.raceStart, (m: RaceStartMessage) => (this.start = m));
    room.onMessage(S2C.snapshot, (m: NetSnapshot) => this.snaps.push(m));
    room.onMessage(S2C.results, (m: { rows: RaceResultRow[] }) => (this.results = m.rows));
    room.onMessage(S2C.pong, (n: number) => this.pongs.push(n));
    room.onLeave(() => (this.left = true));
    room.send(C2S.sync);
    return this;
  }

  async quick(extra: object = {}) {
    return this.attach(await new Client(URL).joinOrCreate(ROOM_NAME, { ...this.opts, ...extra }));
  }
  async create() {
    return this.attach(await new Client(URL).create(ROOM_NAME, { ...this.opts, private: true }));
  }
  async joinCode(code: string) {
    return this.attach(await new Client(URL).joinById(code, this.opts));
  }

  ready(v = true) {
    this.room.send(C2S.ready, v);
  }
  /** Sends one input per ~16 ms, like the browser client. */
  drive(input: BikeInput = THROTTLE) {
    const packed = packInput(input);
    this.timer = setInterval(() => {
      this.room.send(C2S.input, { s: this.seq, i: [packed, packed] });
      this.seq += 2;
    }, 33);
  }
  stopDriving() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  get me() {
    const last = this.snaps[this.snaps.length - 1];
    const idx = this.start!.config.racers.findIndex((r) => r.id === this.start!.youId);
    return { snap: last, row: last?.r[idx], index: idx };
  }
  async leave() {
    this.stopDriving();
    if (!this.left) await this.room.leave(true);
  }
}

async function until<T>(fn: () => T | null | undefined | false, ms = 15000, label = 'condition'): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v as T;
    if (Date.now() - t0 > ms) throw new Error(`Timed out waiting for ${label}`);
    await sleep(25);
  }
}

let game: GameServer;
const players: TestPlayer[] = [];
const track = (p: TestPlayer) => (players.push(p), p);

beforeAll(async () => {
  game = createGameServer({
    ...loadConfig({}),
    port: PORT,
    lobbyCountdown: 0,
    loadTimeout: 5,
    reconnectWindowRace: 6,
    finishGrace: 20,
    raceLengthOverride: 300,
    allowedOrigins: [],
  });
  await game.listen(PORT);
});

afterAll(async () => {
  for (const p of players) p.stopDriving();
  await game.stop();
});

describe('HTTP', () => {
  it('serves a health endpoint', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});

describe('matchmaking & lobby', () => {
  it('pairs public players into one room, sanitises names and picks a host', async () => {
    const a = track(new TestPlayer('<b>Alice</b>'));
    const b = track(new TestPlayer('Bob'));
    await a.quick();
    await b.quick();
    expect(b.room.roomId).toBe(a.room.roomId);
    await until(() => b.lobby?.players.length === 2, 5000, 'lobby with two players');
    expect(b.lobby!.players.map((p) => p.name)).toEqual(['bAliceb', 'Bob']);
    expect(b.lobby!.hostId).toBe(a.room.sessionId);
    expect(b.lobby!.code).toBe(a.room.roomId);
    expect(b.lobby!.code).toHaveLength(5);
    await a.leave();
    await b.leave();
  });

  it('keeps private rooms out of public matchmaking and lets friends join by code', async () => {
    const host = track(new TestPlayer('Host'));
    await host.create();
    const code = host.room.roomId;
    const stranger = track(new TestPlayer('Stranger'));
    await stranger.quick();
    expect(stranger.room.roomId).not.toBe(code);
    const friend = track(new TestPlayer('Friend'));
    await friend.joinCode(code);
    expect(friend.room.roomId).toBe(code);
    await until(() => friend.lobby?.players.length === 2, 5000, 'friend lobby');
    expect(friend.lobby!.isPrivate).toBe(true);
    await Promise.all([host.leave(), stranger.leave(), friend.leave()]);
  });

  it('rejects unknown room codes and outdated clients', async () => {
    await expect(new Client(URL).joinById('ZZZZZ', { name: 'X', bikeId: 'viper', v: PROTOCOL_VERSION })).rejects.toBeTruthy();
    await expect(new Client(URL).joinOrCreate(ROOM_NAME, { name: 'Old', bikeId: 'viper', v: 0 })).rejects.toThrow(/version/i);
  });

  it('only the host can change settings; bike changes are validated', async () => {
    const host = track(new TestPlayer('Host2'));
    await host.create();
    const guest = track(new TestPlayer('Guest2'));
    await guest.joinCode(host.room.roomId);
    await until(() => guest.lobby?.players.length === 2, 5000, 'two players');
    guest.room.send(C2S.settings, { trafficDensity: 'high', fillWithBots: true });
    host.room.send(C2S.bike, 'not-a-bike');
    host.room.send(C2S.settings, { trafficDensity: 'high', mapId: 'desert-run' });
    await until(() => host.lobby?.trafficDensity === 'high', 5000, 'host settings applied');
    expect(host.lobby!.fillWithBots).toBe(false); // guest attempt ignored
    expect(host.lobby!.mapId).toBe('coastal-highway'); // unplayable map rejected
    expect(host.lobby!.players[0].bikeId).toBe('viper');
    host.room.send(C2S.bike, 'blade');
    await until(() => host.lobby?.players[0].bikeId === 'blade', 5000, 'bike change');
    await Promise.all([host.leave(), guest.leave()]);
  });

  it('hands the host role over when the host leaves', async () => {
    const host = track(new TestPlayer('H3'));
    await host.create();
    const guest = track(new TestPlayer('G3'));
    await guest.joinCode(host.room.roomId);
    await until(() => guest.lobby?.players.length === 2, 5000, 'two players');
    await host.leave();
    await until(() => guest.lobby?.hostId === guest.room.sessionId && guest.lobby.players.length === 1, 5000, 'host reassigned');
    await guest.leave();
  });
});

describe('server-authoritative race', () => {
  it('runs a full race: sync start, validated inputs, snapshots with acks, results', async () => {
    const a = track(new TestPlayer('Racer A'));
    const b = track(new TestPlayer('Racer B'));
    await a.quick();
    await b.quick();
    await until(() => b.lobby?.players.length === 2, 5000, 'both joined');

    a.ready();
    expect(a.lobby?.phase).toBe('lobby'); // one ready player is not enough to start
    await sleep(200);
    expect(a.start).toBeNull();
    b.ready();

    await until(() => a.start && b.start, 8000, 'raceStart');
    expect(a.start!.config.seed).toBe(b.start!.config.seed);
    expect(a.start!.config.raceLength).toBe(300);
    expect(a.start!.youId).toBe(a.room.sessionId);
    expect(b.start!.youId).toBe(b.room.sessionId);
    expect(a.start!.config.racers.map((r) => r.id)).toEqual([a.room.sessionId, b.room.sessionId]);
    expect(a.snaps.length).toBe(0); // nothing is simulated until both clients report loaded

    a.room.send(C2S.loaded);
    await sleep(300);
    expect(a.snaps.length).toBe(0);
    b.room.send(C2S.loaded);
    await until(() => a.snaps.length > 3 && b.snaps.length > 3, 5000, 'snapshots');

    // Synchronised start: both clients see the same countdown phase and tick numbers.
    expect(a.snaps[0].ph).toBe(0);
    expect(a.snaps[0].t).toBe(b.snaps[0].t);
    await until(() => a.snaps.some((s) => s.ph === 1), 8000, 'racing phase');

    a.drive();
    b.drive({ ...THROTTLE, steer: 0 });

    const r = await until(() => a.results && b.results, 45000, 'results');
    a.stopDriving();
    b.stopDriving();
    expect(r).toBeTruthy();
    expect(a.results!.map((x) => x.place)).toEqual([1, 2]);
    expect(a.results).toEqual(b.results);
    for (const row of a.results!) {
      expect(row.time).toBeGreaterThan(5); // 300 m cannot be covered faster than physics allows
      expect(row.time).toBeLessThan(60);
      expect(row.coins).toBeGreaterThan(0);
    }
    // Acks advanced: the server consumed our inputs.
    expect(a.snaps[a.snaps.length - 1].a).toBeGreaterThan(100);
    await a.leave();
    await b.leave();
  });

  it('cannot be sped up by flooding inputs, and ignores malformed input', async () => {
    const a = track(new TestPlayer('Speed A'));
    const b = track(new TestPlayer('Speed B'));
    await a.quick();
    await b.quick();
    await until(() => b.lobby?.players.length === 2, 5000, 'both joined');
    a.ready();
    b.ready();
    await until(() => a.start && b.start, 8000, 'raceStart');
    a.room.send(C2S.loaded);
    b.room.send(C2S.loaded);
    await until(() => a.snaps.some((s) => s.ph === 1), 10000, 'racing');

    const t0 = Date.now();
    const packed = packInput(THROTTLE);
    // Cheater floods 8-tick messages as fast as the rate limit allows and sends garbage.
    const flood = setInterval(() => {
      for (let k = 0; k < 3; k++) {
        a.room.send(C2S.input, { s: a.seq, i: new Array(8).fill(packed) });
        a.seq += 8;
      }
      a.room.send(C2S.input, { s: 'x', i: [1e12, -5, NaN] });
      a.room.send(C2S.input, 'garbage');
      a.room.send('hack', { health: 9999 });
    }, 20);
    b.drive();
    await sleep(3000);
    clearInterval(flood);
    b.stopDriving();
    const elapsed = (Date.now() - t0) / 1000;
    const cheat = a.me.row[0] / 100; // s in metres
    const honest = b.me.row[0] / 100;
    // Honest rider covers ~elapsed*60 ticks of motion; the flooder gets the same one-input-per-tick cap.
    const maxPossible = BIKES.viper.stats.topSpeed * 1.3 * elapsed;
    expect(cheat).toBeLessThan(maxPossible);
    expect(cheat).toBeLessThan(honest * 1.25 + 5);
    expect(a.me.row[7] / 10).toBeLessThanOrEqual(100); // health can never exceed the cap
    await a.leave();
    await b.leave();
  });

  it('kicks clients that flood control messages', async () => {
    const a = track(new TestPlayer('Flood'));
    await a.create();
    for (let i = 0; i < 2000 && !a.left; i++) {
      a.room.send(C2S.ready, i % 2 === 0);
      if (i % 50 === 0) await sleep(1);
    }
    await until(() => a.left, 10000, 'flooder disconnected');
  });

  it('measures round trip time through ping/pong', async () => {
    const a = track(new TestPlayer('Ping'));
    await a.create();
    a.room.send(C2S.ping, 12345);
    await until(() => a.pongs.includes(12345), 3000, 'pong');
    await a.leave();
  });
});

describe('disconnects & reconnection', () => {
  it('AI keeps a dropped rider on the road and the player can rejoin', async () => {
    const a = track(new TestPlayer('Drop A'));
    const b = track(new TestPlayer('Drop B'));
    await a.quick();
    await b.quick();
    await until(() => b.lobby?.players.length === 2, 5000, 'both joined');
    a.ready();
    b.ready();
    await until(() => a.start && b.start, 8000, 'raceStart');
    a.room.send(C2S.loaded);
    b.room.send(C2S.loaded);
    await until(() => b.snaps.some((s) => s.ph === 1), 10000, 'racing');
    a.drive();

    const token = a.room.reconnectionToken;
    const roomId = a.room.roomId;
    const humanBit = (p: TestPlayer, idx: number) => ((p.me.snap.r[idx][16] as number) & 64) !== 0;
    const idxA = b.start!.config.racers.findIndex((r) => r.id === a.room.sessionId);
    await until(() => b.me.snap && humanBit(b, idxA), 5000, 'A human before drop');

    a.stopDriving();
    // Abnormal close (not a consented leave).
    (a.room.connection as unknown as { close(code: number): void }).close(3001);
    await until(() => b.me.snap && !humanBit(b, idxA), 5000, 'A under AI control');
    const sBefore = b.me.snap.r[idxA][0];
    await sleep(800);
    expect(b.me.snap.r[idxA][0]).toBeGreaterThan(sBefore + 100); // AI is driving it forward
    expect(b.lobby!.players.find((p) => p.id === a.room.sessionId)?.connected).toBe(false);

    const back = new TestPlayer('Drop A');
    back.attach(await new Client(URL).reconnect(token));
    track(back);
    expect(back.room.roomId).toBe(roomId);
    expect(back.room.sessionId).toBe(a.room.sessionId);
    await until(() => back.start, 5000, 'raceStart re-sent after reconnect');
    await until(() => back.snaps.length > 2, 5000, 'snapshots after reconnect');
    await until(() => b.me.snap && humanBit(b, idxA), 5000, 'A human again');
    expect(b.lobby!.players.find((p) => p.id === back.room.sessionId)?.connected).toBe(true);
    await back.leave();
    await b.leave();
  });

  it('abandoned riders are marked as left in the results', async () => {
    const a = track(new TestPlayer('Gone A'));
    const b = track(new TestPlayer('Gone B'));
    await a.quick();
    await b.quick();
    await until(() => b.lobby?.players.length === 2, 5000, 'both joined');
    a.ready();
    b.ready();
    await until(() => a.start && b.start, 8000, 'raceStart');
    a.room.send(C2S.loaded);
    b.room.send(C2S.loaded);
    await until(() => b.snaps.some((s) => s.ph === 1), 10000, 'racing');
    await a.leave(); // consented leave: no reconnection window
    b.drive();
    await until(() => b.results, 45000, 'results after A left');
    b.stopDriving();
    const rowA = b.results!.find((r) => r.id === a.room.sessionId)!;
    const rowB = b.results!.find((r) => r.id === b.room.sessionId)!;
    expect(rowA.left).toBe(true);
    expect(rowB.left).toBe(false);
    expect(rowB.isHuman).toBe(true);
    expect(b.results!.map((r) => r.place)).toEqual([1, 2]);
    await b.leave();
  });

  it('returns the room to the lobby after the results screen', async () => {
    const a = track(new TestPlayer('Again A'));
    const b = track(new TestPlayer('Again B'));
    await a.quick();
    await b.quick();
    await until(() => b.lobby?.players.length === 2, 5000, 'both joined');
    a.ready();
    b.ready();
    await until(() => a.start && b.start, 8000, 'raceStart');
    a.room.send(C2S.loaded);
    b.room.send(C2S.loaded);
    await until(() => a.snaps.some((s) => s.ph === 1), 10000, 'racing');
    a.drive();
    b.drive();
    await until(() => a.results && b.results, 45000, 'results');
    a.stopDriving();
    b.stopDriving();
    expect(a.lobby!.phase).toBe('results');
    a.room.send(C2S.again);
    await until(() => a.lobby?.phase === 'lobby' && a.lobby.players.every((p) => !p.ready), 5000, 'back in lobby');
    expect(a.lobby!.players).toHaveLength(2);
    await a.leave();
    await b.leave();
  });
});
