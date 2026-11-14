import { loadConfig, loadDotEnv } from './config/env.js';
import { createGameServer } from './server.js';

loadDotEnv();
const config = loadConfig();
const game = createGameServer(config);

await game.listen();
console.log(`HIGHWAY RUSH server listening on :${config.port}`);
console.log(config.allowedOrigins.length ? `Allowed origins: ${config.allowedOrigins.join(', ')}` : 'WARNING: CLIENT_ORIGINS is empty — accepting connections from any origin (dev only).');

const shutdown = async () => {
  console.log('Shutting down…');
  await game.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
