/**
 * Dev tool: a headless player that joins a room, readies up and races, so a single developer can test
 * multiplayer from one browser tab.
 *
 *   npm run bot -w @highway-rush/server -- --code ABCDE          # join a private room
 *   npm run bot -w @highway-rush/server -- --quick               # join public matchmaking
 *   npm run bot -w @highway-rush/server -- --code ABCDE --aggressive --name Rex --bike blade
 *
 * Env: SERVER_URL (default ws://localhost:2567)
 */
import { Client, type Room } from 'colyseus.js';
import {
  ATTACKS,
  C2S,
  PROTOCOL_VERSION,
  ROOM_NAME,
  S2C,
  decodeRacer,
  packInput,
  createRng,
  RaceSimulation,
  TRACKS,
  type BikeInput,
  type NetSnapshot,
  type RaceStartMessage,
  type RacerState,
} from '@highway-rush/shared';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const url = process.env.SERVER_URL ?? 'ws://localhost:2567';
const name = value('name', 'Bot');
const bikeId = value('bike', 'viper');
const code = value('code', '');
const aggressive = flag('aggressive');

const client = new Client(url);
const options = { name, bikeId, v: PROTOCOL_VERSION };
const room: Room = code ? await client.joinById(code.toUpperCase(), options) : await client.joinOrCreate(ROOM_NAME, options);
console.log(`[bot] ${name} joined room ${room.roomId}`);

let start: RaceStartMessage | null = null;
let mirror: RaceSimulation | null = null;
let myIndex = -1;
let seq = 0;
let latest: NetSnapshot | null = null;
const rng = createRng(Date.now() & 0x7fffffff);

room.onMessage(S2C.lobby, (lobby: { phase: string; players: Array<{ id: string; ready: boolean }> }) => {
  const me = lobby.players.find((p) => p.id === room.sessionId);
  if (lobby.phase === 'lobby' && me && !me.ready) room.send(C2S.ready, true);
});
room.onMessage(S2C.raceStart, (msg: RaceStartMessage) => {
  if (start?.config.seed === msg.config.seed) return;
  start = msg;
  const track = TRACKS[msg.config.mapId]!;
  mirror = new RaceSimulation({
    track: { ...track, raceLength: msg.config.raceLength ?? track.raceLength },
    racers: msg.config.racers,
    trafficCount: msg.config.trafficCount,
    seed: msg.config.seed,
    countdownSeconds: msg.config.countdownSeconds,
  });
  myIndex = msg.config.racers.findIndex((r) => r.id === msg.youId);
  seq = 0;
  console.log('[bot] race loading');
  room.send(C2S.loaded);
});
room.onMessage(S2C.snapshot, (snap: NetSnapshot) => {
  latest = snap;
});
room.onMessage(S2C.results, (msg: { rows: Array<{ place: number; name: string; time: number }> }) => {
  console.log('[bot] results:', msg.rows.map((r) => `${r.place}. ${r.name} ${r.time.toFixed(1)}s`).join('  '));
  setTimeout(() => room.send(C2S.again), 1500);
});
room.onLeave((c: number) => {
  console.log('[bot] left room', c);
  process.exit(0);
});
room.send(C2S.sync);

const targetLane = [1.8, 5.4][Math.floor(rng.next() * 2)];

/** ~60 inputs/s like the browser: steer to a lane, always throttle, punch/kick whoever is alongside. */
setInterval(() => {
  if (!latest || !mirror || latest.ph !== 1) return;
  const racers = mirror.racers;
  racers.forEach((r, i) => decodeRacer(latest!.r[i], r));
  const me: RacerState = racers[myIndex];
  const steer = Math.max(-1, Math.min(1, (targetLane - me.d) * 0.3 - me.yaw * 3));
  let punch = false;
  let kick = false;
  if (aggressive) {
    for (const o of racers) {
      if (o === me || o.crashed) continue;
      const ds = Math.abs(o.s - me.s);
      const dd = Math.abs(o.d - me.d);
      if (ds < ATTACKS.kick.rangeS && dd < ATTACKS.kick.rangeD) kick = true;
      else if (ds < ATTACKS.punch.rangeS && dd < ATTACKS.punch.rangeD) punch = true;
    }
  }
  const input: BikeInput = { throttle: 1, brake: 0, steer, nitro: me.nitro > 40, wheelie: false, punch, kick, weapon: !!me.combat.weapon && aggressive, block: false };
  const packed = packInput(input);
  room.send(C2S.input, { s: seq, i: [packed, packed, packed, packed] });
  seq += 4;
}, 66);

process.on('SIGINT', () => {
  void room.leave().then(() => process.exit(0));
});
