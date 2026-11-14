import { randomInt } from 'node:crypto';
import { Room, ServerError, matchMaker, type Client } from '@colyseus/core';
import {
  BIKES,
  C2S,
  FIXED_DT,
  NET,
  PROTOCOL_VERSION,
  RaceSimulation,
  S2C,
  TRACKS,
  TRAFFIC_DENSITY,
  TICK_RATE,
  buildResultRows,
  createRng,
  encodeSnapshot,
  parseInputMessage,
  sanitizePlayerName,
  setAIControl,
  type BikeId,
  type LobbyPlayer,
  type LobbyState,
  type MapId,
  type NetRaceConfig,
  type RaceEvent,
  type RacerConfig,
  type RaceResultRow,
  type RoomPhase,
  type SettingsMessage,
  type TrafficDensity,
  MAPS,
} from '@highway-rush/shared';
import type { ServerConfig } from '../config/env.js';
import { allocateRoomCode } from '../matchmaking/roomCodes.js';
import { InputQueue } from '../systems/inputQueue.js';
import { ClientLimiter, type LimitKind } from '../systems/rateLimiter.js';

/** Grid colours by slot so riders on the same bike model are still distinguishable. */
const SLOT_COLORS = ['#e11d48', '#0ea5e9', '#a3e635', '#f59e0b'];

/** Clearly-labelled AI riders used when the host enables "fill with AI". */
const BOT_ROSTER: Array<Pick<RacerConfig, 'name' | 'bikeId' | 'skill' | 'aggression'>> = [
  { name: 'Nova (AI)', bikeId: 'blade', skill: 0.93, aggression: 0.55 },
  { name: 'Diesel (AI)', bikeId: 'thunder', skill: 0.99, aggression: 0.85 },
  { name: 'Kestrel (AI)', bikeId: 'viper', skill: 0.96, aggression: 0.4 },
];

const SNAPSHOT_EVERY_TICKS = TICK_RATE / NET.snapshotRate;
const MAX_STEPS_PER_FRAME = 6;
const DENSITIES = Object.keys(TRAFFIC_DENSITY) as TrafficDensity[];

interface JoinOptions {
  name?: unknown;
  bikeId?: unknown;
  private?: unknown;
  v?: unknown;
}

interface Player {
  id: string;
  client: Client;
  name: string;
  bikeId: BikeId;
  ready: boolean;
  connected: boolean;
  joinOrder: number;
  loaded: boolean;
  left: boolean;
  kicked: boolean;
  limiter: ClientLimiter;
  queue: InputQueue;
}

const isBikeId = (v: unknown): v is BikeId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(BIKES, v);
const isMapId = (v: unknown): v is MapId => typeof v === 'string' && MAPS.some((m) => m.id === v && m.playable);

/**
 * One race lobby + race. The server owns the simulation: clients only send packed inputs, ready
 * flags and settings. Positions, health, damage, nitro, hits and finish order never come from a client.
 */
export class RaceRoom extends Room {
  /** Injected by the server bootstrap. */
  static config: ServerConfig;

  maxClients = NET.maxPlayers;

  private cfg!: ServerConfig;
  private code = '';
  private isPrivate = false;
  private phase: RoomPhase = 'lobby';
  private hostId = '';
  private mapId: MapId = 'coastal-highway';
  private trafficDensity: TrafficDensity = 'medium';
  private fillWithBots = false;
  private startingIn: number | null = null;
  private countdownTimer: { clear(): void } | null = null;
  private loadTimer: { clear(): void } | null = null;
  private joinCounter = 0;
  private players = new Map<string, Player>();
  private sim: RaceSimulation | null = null;
  private raceConfig: NetRaceConfig | null = null;
  private rng = createRng(randomInt(2 ** 31));
  private accumulator = 0;
  private pendingEvents: RaceEvent[] = [];
  private firstFinishTime: number | null = null;
  private lastRows: RaceResultRow[] | null = null;

  // ---------------------------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------------------------

  async onCreate(options: JoinOptions) {
    this.cfg = RaceRoom.config;
    this.code = await allocateRoomCode(async (c) => {
      try {
        return !!(await matchMaker.getRoomById(c));
      } catch {
        return false;
      }
    });
    this.roomId = this.code;
    this.isPrivate = options?.private === true;
    await this.setPrivate(this.isPrivate);

    this.onMessage(C2S.ready, (client, msg) => this.handle(client, 'control', () => this.onReady(client, msg)));
    this.onMessage(C2S.bike, (client, msg) => this.handle(client, 'control', () => this.onBike(client, msg)));
    this.onMessage(C2S.settings, (client, msg) => this.handle(client, 'control', () => this.onSettings(client, msg)));
    this.onMessage(C2S.loaded, (client) => this.handle(client, 'control', () => this.onLoaded(client)));
    this.onMessage(C2S.again, (client) => this.handle(client, 'control', () => this.onAgain(client)));
    this.onMessage(C2S.sync, (client) => this.handle(client, 'control', () => this.onSync(client)));
    this.onMessage(C2S.input, (client, msg) => this.handle(client, 'input', () => this.onInput(client, msg)));
    this.onMessage(C2S.ping, (client, msg) =>
      this.handle(client, 'ping', () => {
        if (typeof msg === 'number' && Number.isFinite(msg)) client.send(S2C.pong, msg);
      }),
    );
    // Anything else is invalid; count it against the sender instead of letting Colyseus log it.
    this.onMessage('*', (client) => this.handle(client, 'control', () => undefined));

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), 1000 / TICK_RATE);
    console.log(`[room ${this.code}] created (${this.isPrivate ? 'private' : 'public'})`);
  }

  onAuth(_client: Client, options: JoinOptions) {
    if (options?.v !== PROTOCOL_VERSION) throw new ServerError(4010, 'Game version mismatch. Please refresh the page.');
    return true;
  }

  onJoin(client: Client, options: JoinOptions) {
    const player: Player = {
      id: client.sessionId,
      client,
      name: sanitizePlayerName(options?.name),
      bikeId: isBikeId(options?.bikeId) ? options.bikeId : 'viper',
      ready: false,
      connected: true,
      joinOrder: this.joinCounter++,
      loaded: false,
      left: false,
      kicked: false,
      limiter: new ClientLimiter(),
      queue: new InputQueue(),
    };
    this.players.set(player.id, player);
    if (!this.hostId || !this.players.get(this.hostId)?.connected) this.hostId = player.id;
    console.log(`[room ${this.code}] ${player.name} joined (${this.players.size}/${this.maxClients})`);
    this.broadcastLobby();
    this.evaluateStart();
  }

  async onLeave(client: Client, consented?: boolean) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    player.connected = false;
    console.log(`[room ${this.code}] ${player.name} left (consented=${!!consented})`);

    if (this.phase === 'lobby' || this.phase === 'results') {
      this.removePlayer(player);
      return;
    }

    // Loading / racing: AI keeps the bike on the road while the player may come back.
    const racer = this.sim?.getRacer(player.id);
    if (racer) setAIControl(racer, true, this.rng);
    this.broadcastLobby();

    const window = this.cfg.reconnectWindowRace;
    if (consented || player.kicked || window <= 0) {
      this.markLeft(player);
      return;
    }

    try {
      const newClient = await this.allowReconnection(client, window);
      player.client = newClient;
      player.connected = true;
      player.limiter = new ClientLimiter();
      player.queue.reset();
      player.loaded = false;
      const r = this.sim?.getRacer(player.id);
      if (r && (this.phase as RoomPhase) !== 'results') setAIControl(r, false, this.rng);
      console.log(`[room ${this.code}] ${player.name} reconnected`);
      this.broadcastLobby();
    } catch {
      this.markLeft(player);
    }
  }

  onDispose() {
    this.countdownTimer?.clear();
    this.loadTimer?.clear();
    console.log(`[room ${this.code}] disposed`);
  }

  // ---------------------------------------------------------------------------------------------
  // Message handling (every path validates; nothing from a client is trusted)
  // ---------------------------------------------------------------------------------------------

  private handle(client: Client, kind: LimitKind, fn: () => void) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    if (!player.limiter.allow(kind)) {
      if (player.limiter.isAbusive()) {
        player.kicked = true;
        console.warn(`[room ${this.code}] kicking ${player.name} for message flooding`);
        client.leave(4008, 'Rate limit exceeded');
      }
      return;
    }
    try {
      fn();
    } catch (err) {
      console.error(`[room ${this.code}] message handler error`, err);
    }
  }

  private onReady(client: Client, msg: unknown) {
    const p = this.players.get(client.sessionId);
    if (!p || this.phase !== 'lobby' || typeof msg !== 'boolean') return;
    p.ready = msg;
    this.broadcastLobby();
    this.evaluateStart();
  }

  private onBike(client: Client, msg: unknown) {
    const p = this.players.get(client.sessionId);
    if (!p || this.phase !== 'lobby' || p.ready || !isBikeId(msg)) return;
    p.bikeId = msg;
    this.broadcastLobby();
  }

  private onSettings(client: Client, msg: unknown) {
    if (client.sessionId !== this.hostId || this.phase !== 'lobby' || typeof msg !== 'object' || msg === null) return;
    const s = msg as SettingsMessage;
    if (s.mapId !== undefined && isMapId(s.mapId)) this.mapId = s.mapId;
    if (s.trafficDensity !== undefined && DENSITIES.includes(s.trafficDensity)) this.trafficDensity = s.trafficDensity;
    if (typeof s.fillWithBots === 'boolean') this.fillWithBots = s.fillWithBots;
    // Changing the rules invalidates earlier "ready" votes.
    for (const p of this.players.values()) p.ready = false;
    this.broadcastLobby();
    this.evaluateStart();
  }

  private onLoaded(client: Client) {
    const p = this.players.get(client.sessionId);
    if (!p || this.phase !== 'loading') return;
    p.loaded = true;
    if (this.activePlayers().every((x) => x.loaded)) this.beginRace();
  }

  private onSync(client: Client) {
    const p = this.players.get(client.sessionId);
    if (!p) return;
    client.send(S2C.lobby, this.lobbyState());
    this.sendRaceStart(p);
    if (this.phase === 'results' && this.lastRows) client.send(S2C.results, { rows: this.lastRows });
  }

  private onAgain(client: Client) {
    if (!this.players.has(client.sessionId) || this.phase !== 'results') return;
    void this.returnToLobby();
  }

  private onInput(client: Client, msg: unknown) {
    const p = this.players.get(client.sessionId);
    if (!p || this.phase !== 'racing') return;
    const parsed = parseInputMessage(msg);
    if (!parsed) return;
    p.queue.push(parsed.s, parsed.inputs);
  }

  // ---------------------------------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------------------------------

  private activePlayers() {
    return [...this.players.values()].filter((p) => p.connected && !p.left);
  }

  private lobbyState(): LobbyState {
    const players: LobbyPlayer[] = [...this.players.values()]
      .filter((p) => !p.left)
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((p) => ({ id: p.id, name: p.name, bikeId: p.bikeId, ready: p.ready, connected: p.connected }));
    return {
      code: this.code,
      isPrivate: this.isPrivate,
      phase: this.phase,
      hostId: this.hostId,
      mapId: this.mapId,
      trafficDensity: this.trafficDensity,
      fillWithBots: this.fillWithBots,
      minPlayers: this.fillWithBots ? 1 : NET.minPlayers,
      maxPlayers: NET.maxPlayers,
      players,
      startingIn: this.startingIn,
    };
  }

  private broadcastLobby() {
    const state = this.lobbyState();
    for (const p of this.players.values()) if (p.connected) p.client.send(S2C.lobby, state);
  }

  private canStart() {
    if (this.phase !== 'lobby') return false;
    const ps = this.activePlayers();
    return ps.length >= (this.fillWithBots ? 1 : NET.minPlayers) && ps.every((p) => p.ready);
  }

  private evaluateStart() {
    if (this.canStart()) {
      if (this.countdownTimer) return;
      this.startingIn = Math.ceil(this.cfg.lobbyCountdown);
      this.broadcastLobby();
      if (this.startingIn <= 0) {
        this.startingIn = null;
        void this.startRace();
        return;
      }
      this.countdownTimer = this.clock.setInterval(() => {
        if (!this.canStart()) return this.cancelCountdown();
        this.startingIn = (this.startingIn ?? 1) - 1;
        if (this.startingIn <= 0) {
          this.cancelCountdown();
          void this.startRace();
        } else this.broadcastLobby();
      }, 1000);
    } else if (this.countdownTimer) {
      this.cancelCountdown();
    }
  }

  private cancelCountdown() {
    this.countdownTimer?.clear();
    this.countdownTimer = null;
    this.startingIn = null;
    this.broadcastLobby();
  }

  private removePlayer(p: Player) {
    this.players.delete(p.id);
    if (this.hostId === p.id) {
      const next = this.activePlayers()[0];
      this.hostId = next?.id ?? '';
    }
    this.broadcastLobby();
    this.evaluateStart();
  }

  private async returnToLobby() {
    for (const p of [...this.players.values()]) if (p.left || !p.connected) this.players.delete(p.id);
    for (const p of this.players.values()) {
      p.ready = false;
      p.loaded = false;
      p.queue.reset();
    }
    if (!this.players.get(this.hostId)) this.hostId = this.activePlayers()[0]?.id ?? '';
    this.sim = null;
    this.raceConfig = null;
    this.lastRows = null;
    this.pendingEvents = [];
    this.firstFinishTime = null;
    this.phase = 'lobby';
    this.startingIn = null;
    await this.unlock();
    this.broadcastLobby();
  }

  // ---------------------------------------------------------------------------------------------
  // Race
  // ---------------------------------------------------------------------------------------------

  private async startRace() {
    if (this.phase !== 'lobby') return;
    const humans = this.activePlayers().sort((a, b) => a.joinOrder - b.joinOrder).slice(0, NET.maxPlayers);
    if (humans.length === 0) return;
    this.phase = 'loading';
    await this.lock();

    const racers: RacerConfig[] = humans.map((p, i) => ({ id: p.id, name: p.name, bikeId: p.bikeId, isHuman: true, color: SLOT_COLORS[i] }));
    if (this.fillWithBots) {
      for (let i = 0; racers.length < NET.maxPlayers; i++) {
        const bot = BOT_ROSTER[i % BOT_ROSTER.length];
        racers.push({ id: `bot-${i + 1}`, isHuman: false, color: SLOT_COLORS[racers.length], ...bot });
      }
    }
    const baseTrack = TRACKS[this.mapId]!;
    const config: NetRaceConfig = {
      mapId: this.mapId,
      seed: randomInt(2 ** 31),
      trafficCount: TRAFFIC_DENSITY[this.trafficDensity],
      countdownSeconds: 3.5,
      raceLength: this.cfg.raceLengthOverride,
      racers,
    };
    this.raceConfig = config;
    this.sim = new RaceSimulation({
      track: { ...baseTrack, raceLength: config.raceLength ?? baseTrack.raceLength },
      racers: config.racers,
      trafficCount: config.trafficCount,
      seed: config.seed,
      countdownSeconds: config.countdownSeconds,
    });
    this.accumulator = 0;
    this.pendingEvents = [];
    this.firstFinishTime = null;
    for (const p of this.players.values()) {
      p.loaded = false;
      p.queue.reset();
    }
    console.log(`[room ${this.code}] race loading: ${racers.map((r) => r.name).join(', ')}`);
    this.broadcastLobby();
    for (const p of humans) this.sendRaceStart(p);
    this.loadTimer = this.clock.setTimeout(() => this.beginRace(), this.cfg.loadTimeout * 1000);
  }

  private sendRaceStart(p: Player) {
    if (!this.raceConfig || (this.phase !== 'loading' && this.phase !== 'racing')) return;
    p.client.send(S2C.raceStart, { config: this.raceConfig, youId: p.id });
  }

  /** Called once every client reports its scene is ready (or the load timeout fires). */
  private beginRace() {
    if (this.phase !== 'loading') return;
    this.loadTimer?.clear();
    this.loadTimer = null;
    this.phase = 'racing';
    this.accumulator = 0;
    console.log(`[room ${this.code}] race started`);
    this.broadcastLobby();
  }

  private update(deltaMs: number) {
    if (this.phase !== 'racing' || !this.sim) return;
    this.accumulator += Math.min(deltaMs, 250) / 1000;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME && this.phase === 'racing') {
      this.stepOnce();
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
  }

  private stepOnce() {
    const sim = this.sim!;
    for (const p of this.players.values()) {
      const racer = sim.getRacer(p.id);
      if (!racer || racer.ai) continue;
      const input = p.queue.next();
      if (input) sim.setInput(p.id, input);
    }
    sim.step(FIXED_DT);
    for (const e of sim.drainEvents()) this.pendingEvents.push(e);
    if (sim.tick % SNAPSHOT_EVERY_TICKS === 0) this.sendSnapshots();
    this.checkRaceEnd();
  }

  private sendSnapshots() {
    const sim = this.sim!;
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      const racer = sim.getRacer(p.id);
      p.client.send(S2C.snapshot, encodeSnapshot(sim, p.queue.ack, events, racer?.s ?? 0));
    }
  }

  private checkRaceEnd() {
    const sim = this.sim;
    if (!sim || this.phase !== 'racing') return;
    const humans = sim.racers.filter((r) => r.isHuman);
    if (this.firstFinishTime === null && humans.some((r) => r.finished)) this.firstFinishTime = sim.time;
    const everyoneGone = this.activePlayers().length === 0;
    if (
      sim.phase === 'finished' ||
      everyoneGone ||
      sim.time >= this.cfg.maxRaceSeconds ||
      (this.firstFinishTime !== null && sim.time - this.firstFinishTime >= this.cfg.finishGrace)
    ) {
      this.endRace();
    }
  }

  private endRace() {
    const sim = this.sim;
    if (!sim || this.phase !== 'racing') return;
    // Flush the last state so clients see the finish before the results arrive.
    this.sendSnapshots();
    const left = new Set([...this.players.values()].filter((p) => p.left).map((p) => p.id));
    const rows = buildResultRows(sim, left);
    this.lastRows = rows;
    this.phase = 'results';
    for (const p of this.players.values()) p.ready = false;
    console.log(`[room ${this.code}] race finished: ${rows.map((r) => `${r.place}.${r.name}`).join(' ')}`);
    this.broadcastLobby();
    for (const p of this.players.values()) if (p.connected) p.client.send(S2C.results, { rows });
  }

  private markLeft(p: Player) {
    p.left = true;
    p.connected = false;
    if (this.phase === 'results') this.players.delete(p.id);
    if (this.hostId === p.id) this.hostId = this.activePlayers()[0]?.id ?? '';
    this.broadcastLobby();
    this.checkRaceEnd();
    if (this.phase === 'loading' && this.activePlayers().every((x) => x.loaded)) this.beginRace();
  }
}
