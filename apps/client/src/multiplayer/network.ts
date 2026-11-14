import { Client, type Room } from 'colyseus.js';
import {
  C2S,
  PROTOCOL_VERSION,
  ROOM_NAME,
  S2C,
  normalizeRoomCode,
  sanitizePlayerName,
  type BikeId,
  type LobbyState,
  type RaceResultRow,
  type RaceStartMessage,
  type SettingsMessage,
} from '@highway-rush/shared';
import { useGame } from '../store/gameStore';
import { useNet } from './netStore';
import { getServerUrl } from './serverUrl';

const TOKEN_KEY = 'highway-rush-reconnect';
const CONSENTED_CLOSE = 4000;
const KICKED_CLOSE = 4008;
const RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 1500;
const PING_INTERVAL_MS = 2000;

/** Implemented by the online race session so the network layer can feed it. */
export interface NetSessionSink {
  ingestSnapshot(raw: unknown): void;
  onResults(rows: RaceResultRow[]): void;
  onReconnected(): void;
}

export interface JoinProfile {
  name: string;
  bikeId: BikeId;
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: number })?.code;
  if (code === 4010 || /version/i.test(msg)) return 'Your game version is out of date. Refresh the page and try again.';
  if (/locked/i.test(msg)) return 'That room is already racing. Try again in a moment.';
  if (/full|maxClients/i.test(msg)) return 'That room is full.';
  if (/not found|invalid room|no rooms/i.test(msg)) return 'Room not found. Check the code and try again.';
  if (/origin/i.test(msg) || code === 403) return 'The server rejected this website (CORS / allowed origins).';
  if (/failed to fetch|network|ECONNREFUSED|WebSocket|connect/i.test(msg) || err instanceof TypeError) {
    return `Cannot reach the game server at ${getServerUrl()}. Is it running?`;
  }
  return msg || 'Could not connect.';
}

class NetworkManager {
  private client: Client | null = null;
  private room: Room | null = null;
  private session: NetSessionSink | null = null;
  private pingTimer: number | null = null;
  private leaving = false;
  private reconnecting = false;

  get connected() {
    return this.room !== null;
  }

  attachSession(session: NetSessionSink | null) {
    this.session = session;
  }

  // ---------------------------------------------------------------------------------------------
  // Joining
  // ---------------------------------------------------------------------------------------------

  quickMatch(profile: JoinProfile) {
    return this.join((c) => c.joinOrCreate(ROOM_NAME, this.options(profile)));
  }

  createPrivate(profile: JoinProfile) {
    return this.join((c) => c.create(ROOM_NAME, { ...this.options(profile), private: true }));
  }

  joinCode(rawCode: string, profile: JoinProfile) {
    const code = normalizeRoomCode(rawCode);
    if (!code) {
      const error = 'Room codes are 5 characters (letters and numbers).';
      useNet.getState().set({ status: 'idle', error });
      return Promise.reject(new Error(error));
    }
    return this.join((c) => c.joinById(code, this.options(profile)));
  }

  private options(profile: JoinProfile) {
    return { name: sanitizePlayerName(profile.name), bikeId: profile.bikeId, v: PROTOCOL_VERSION };
  }

  private async join(connect: (client: Client) => Promise<Room>) {
    await this.leave(false);
    const net = useNet.getState();
    net.reset();
    net.set({ status: 'connecting' });
    try {
      this.client = new Client(getServerUrl());
      const room = await connect(this.client);
      this.bind(room);
    } catch (err) {
      const error = friendlyError(err);
      useNet.getState().set({ status: 'idle', error });
      throw new Error(error);
    }
  }

  /** Called on page load: rejoin a race that was running when the page was closed/reloaded. */
  async tryResume() {
    let token: string | null = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as { token: string; at: number } | null;
      if (saved && Date.now() - saved.at < 60_000) token = saved.token;
    } catch {
      /* ignore */
    }
    if (!token || this.room) return false;
    useNet.getState().set({ status: 'reconnecting', error: null });
    try {
      this.client = new Client(getServerUrl());
      this.bind(await this.client.reconnect(token));
      return true;
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
      useNet.getState().reset();
      return false;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Room wiring
  // ---------------------------------------------------------------------------------------------

  private bind(room: Room) {
    this.room = room;
    this.leaving = false;
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: room.reconnectionToken, at: Date.now() }));
    useNet.getState().set({ status: 'connected', error: null, youId: room.sessionId });

    room.onMessage(S2C.lobby, (lobby: LobbyState) => {
      const net = useNet.getState();
      net.set({ lobby, ...(lobby.phase === 'lobby' ? { raceStart: null, results: null, waiting: false } : {}) });
    });
    room.onMessage(S2C.raceStart, (msg: RaceStartMessage) => {
      const net = useNet.getState();
      // A reconnect re-sends the same race: keep the running session instead of restarting the scene.
      if (net.raceStart?.config.seed === msg.config.seed) return;
      net.set({ raceStart: msg, results: null, waiting: true });
      useGame.getState().startOnlineRace();
    });
    room.onMessage(S2C.snapshot, (raw: unknown) => this.session?.ingestSnapshot(raw));
    room.onMessage(S2C.results, (msg: { rows: RaceResultRow[] }) => {
      useNet.getState().set({ results: msg.rows });
      this.session?.onResults(msg.rows);
    });
    room.onMessage(S2C.pong, (sentAt: number) => {
      const rtt = performance.now() - sentAt;
      if (!Number.isFinite(rtt) || rtt < 0) return;
      const prev = useNet.getState().ping;
      useNet.getState().set({ ping: prev === 0 ? rtt : prev * 0.7 + rtt * 0.3 });
    });
    room.onMessage(S2C.notice, (msg: { text: string }) => useNet.getState().set({ notice: msg.text }));
    room.onLeave((code: number) => this.onLeave(code));
    room.onError((code: number, message?: string) => console.warn('[net] room error', code, message));

    room.send(C2S.sync);
    this.startPing();
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = window.setInterval(() => this.room?.send(C2S.ping, performance.now()), PING_INTERVAL_MS);
    this.room?.send(C2S.ping, performance.now());
  }

  private stopPing() {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private onLeave(code: number) {
    this.stopPing();
    this.room = null;
    if (this.leaving || code === CONSENTED_CLOSE) {
      sessionStorage.removeItem(TOKEN_KEY);
      return;
    }
    if (code === KICKED_CLOSE) {
      sessionStorage.removeItem(TOKEN_KEY);
      useNet.getState().set({ status: 'disconnected', error: 'You were disconnected for sending too many messages.' });
      return;
    }
    void this.reconnect();
  }

  private async reconnect() {
    if (this.reconnecting || !this.client) return;
    this.reconnecting = true;
    useNet.getState().set({ status: 'reconnecting', error: null });
    let token: string | undefined;
    try {
      token = (JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as { token: string } | null)?.token;
    } catch {
      token = undefined;
    }
    for (let attempt = 0; token && attempt < RECONNECT_ATTEMPTS && !this.leaving; attempt++) {
      await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
      try {
        const room = await this.client.reconnect(token);
        this.bind(room);
        this.session?.onReconnected();
        this.reconnecting = false;
        return;
      } catch {
        /* keep trying until the server's reconnection window closes */
      }
    }
    this.reconnecting = false;
    sessionStorage.removeItem(TOKEN_KEY);
    if (!this.leaving) useNet.getState().set({ status: 'disconnected', error: 'Connection lost. The server closed your seat.' });
  }

  async leave(resetStore = true) {
    this.leaving = true;
    this.stopPing();
    sessionStorage.removeItem(TOKEN_KEY);
    const room = this.room;
    this.room = null;
    this.session = null;
    if (room) {
      try {
        await room.leave(true);
      } catch {
        /* already closed */
      }
    }
    if (resetStore) useNet.getState().reset();
  }

  // ---------------------------------------------------------------------------------------------
  // Outgoing
  // ---------------------------------------------------------------------------------------------

  setReady(ready: boolean) {
    this.room?.send(C2S.ready, ready);
  }
  setBike(bikeId: BikeId) {
    this.room?.send(C2S.bike, bikeId);
  }
  setSettings(settings: SettingsMessage) {
    this.room?.send(C2S.settings, settings);
  }
  sendLoaded() {
    this.room?.send(C2S.loaded);
  }
  backToLobby() {
    this.room?.send(C2S.again);
  }
  sendInput(firstSeq: number, packed: number[]) {
    this.room?.send(C2S.input, { s: firstSeq, i: packed });
  }
}

export const network = new NetworkManager();
