import { existsSync, readFileSync } from 'node:fs';
import { NET } from '@highway-rush/shared';

export interface ServerConfig {
  port: number;
  /** Allowed browser origins. Empty = allow any origin (development only). */
  allowedOrigins: string[];
  lobbyCountdown: number;
  loadTimeout: number;
  reconnectWindowRace: number;
  finishGrace: number;
  maxRaceSeconds: number;
  /** Test hook: shorten every race to this many metres. */
  raceLengthOverride?: number;
}

/** Minimal .env loader (no dependency); real environment variables always win. */
export function loadDotEnv(path = '.env', env: NodeJS.ProcessEnv = process.env) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    if (env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const num = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: num(env.PORT, 2567, 1, 65535),
    allowedOrigins: (env.CLIENT_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    lobbyCountdown: num(env.LOBBY_COUNTDOWN_SECONDS, NET.lobbyCountdown, 0, 60),
    loadTimeout: num(env.LOAD_TIMEOUT_SECONDS, NET.loadTimeout, 1, 120),
    reconnectWindowRace: num(env.RECONNECT_WINDOW_RACE_SECONDS, NET.reconnectWindowRace, 0, 300),
    finishGrace: num(env.FINISH_GRACE_SECONDS, NET.finishGrace, 1, 600),
    maxRaceSeconds: num(env.MAX_RACE_SECONDS, NET.maxRaceSeconds, 10, 3600),
    raceLengthOverride: env.RACE_LENGTH_OVERRIDE ? num(env.RACE_LENGTH_OVERRIDE, 0, 100, 20000) || undefined : undefined,
  };
}

export function isOriginAllowed(origin: string | undefined, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return false;
  return allowed.includes(origin.replace(/\/$/, ''));
}
