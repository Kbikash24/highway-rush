import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Bundle the workspace package (it ships TypeScript source); keep real dependencies external.
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => d !== '@highway-rush/shared');

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  external: [...external, '@colyseus/*', 'ws', 'express', '@pm2/io'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
