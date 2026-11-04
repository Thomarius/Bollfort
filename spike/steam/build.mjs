// The spike's one build step: the game's server bundled into dist/server.mjs, as the desktop
// app bundles it (packages/desktop/build.js), so the spike can host on a machine with no
// development setup. Run from anywhere: node spike/steam/build.mjs
import { resolve } from 'node:path';

import { build } from 'esbuild';

import { ssdpPackageJson } from '../../packages/server/bundling.js';

const here = import.meta.dirname;

await build({
  bundle: true,
  logLevel: 'info',
  target: 'node22',
  stdin: {
    contents: "export { startServer } from './packages/server/src/index.ts';",
    resolveDir: resolve(here, '..', '..'),
    loader: 'ts',
  },
  outfile: resolve(here, 'dist', 'server.mjs'),
  define: { __BOLLFORT_COMMIT__: 'null' },
  platform: 'node',
  format: 'esm',
  external: ['electron', 'bufferutil', 'utf-8-validate'],
  plugins: [ssdpPackageJson],
  // ws is CommonJS, and needs a real `require` inside an ES module; see the server's build.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
});
