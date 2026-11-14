import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Integration tests start real servers on fixed ports; run files one at a time.
    fileParallelism: false,
  },
});
