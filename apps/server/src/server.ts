import http from 'node:http';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@highway-rush/shared';
import { isOriginAllowed, type ServerConfig } from './config/env.js';
import { RaceRoom } from './rooms/RaceRoom.js';

export interface GameServer {
  server: Server;
  httpServer: http.Server;
  listen(port?: number): Promise<void>;
  stop(): Promise<void>;
}

/** Builds the Colyseus server. Used by `index.ts` and by integration tests. */
export function createGameServer(config: ServerConfig): GameServer {
  RaceRoom.config = config;
  const startedAt = Date.now();

  const httpServer = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, uptime: Math.round((Date.now() - startedAt) / 1000) }));
      return;
    }
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('HIGHWAY RUSH game server is running. This is the API/WebSocket server, not the game website.\n');
      return;
    }
    res.writeHead(404).end();
  });

  const transport = new WebSocketTransport({
    server: httpServer,
    // Inputs are tiny; a small cap stops oversized-payload abuse.
    maxPayload: 4 * 1024,
    verifyClient: (info, done) => {
      if (isOriginAllowed(info.origin, config.allowedOrigins)) done(true);
      else done(false, 403, 'Origin not allowed');
    },
  });

  const server = new Server({ transport, greet: false });
  server.define(ROOM_NAME, RaceRoom);

  // Matchmaking is plain HTTP, so CORS must follow the same allowlist as the WebSocket origin check.
  const defaults = matchMaker.controller.DEFAULT_CORS_HEADERS;
  matchMaker.controller.getCorsHeaders = (req) => {
    const origin = req.headers.origin;
    const allowed = isOriginAllowed(origin, config.allowedOrigins);
    return { ...defaults, 'Access-Control-Allow-Origin': allowed && origin ? origin : config.allowedOrigins[0] ?? 'null', Vary: 'Origin' };
  };

  return {
    server,
    httpServer,
    listen: async (port = config.port) => {
      await server.listen(port);
    },
    stop: async () => {
      await server.gracefullyShutdown(false);
    },
  };
}
