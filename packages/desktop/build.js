/* global process */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { build } from 'esbuild';

import { ssdpPackageJson } from '../server/bundling.js';

/** Resolved from this file, so the script works from any working directory. */
const here = import.meta.dirname;

/**
 * Bundles the desktop app (PLAN 11.17 A2): Electron's main process, the server and the
 * whole simulation with it, as one file, as the server's own build does for the image;
 * the preload, which Electron runs sandboxed and so wants CommonJS; and the window's own
 * script. Electron itself is provided at run time and left out.
 */
/**
 * The commit this build is of, baked into the app so recordings it makes replay against
 * the right code (PLAN §9): `BOLLFORT_COMMIT` first, as CI sets it, then git, marked
 * `-dirty` with uncommitted changes; null when neither can tell.
 */
function commit() {
  const given = process.env.BOLLFORT_COMMIT?.trim();
  if (given) return given;
  try {
    const git = (...args) =>
      execFileSync('git', args, {
        cwd: here,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    const head = git('rev-parse', '--short=12', 'HEAD');
    return git('status', '--porcelain', '--untracked-files=no') === '' ? head : `${head}-dirty`;
  } catch {
    return null;
  }
}

const shared = { bundle: true, logLevel: 'info', target: 'node22' };

/**
 * The Steam build (STEAM.md §3.5), `BOLLFORT_STEAM=1`: `entry.ts` takes `steamMain.ts` in
 * place of the launcher, and only then is `steamworks.js` reached.
 */
const steam = process.env.BOLLFORT_STEAM === '1';

await build({
  ...shared,
  entryPoints: [resolve(here, 'src', 'entry.ts')],
  outfile: resolve(here, 'dist', 'main.js'),
  define: {
    __BOLLFORT_COMMIT__: JSON.stringify(commit()),
    __BOLLFORT_STEAM__: JSON.stringify(steam),
  },
  platform: 'node',
  format: 'esm',
  // steamworks.js is a native module, loaded from node_modules at run time (Steam build only).
  external: ['electron', 'bufferutil', 'utf-8-validate', 'steamworks.js'],
  plugins: [ssdpPackageJson],
  // ws is CommonJS, and needs a real `require` inside an ES module; see the server's build.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
});

await build({
  ...shared,
  entryPoints: [resolve(here, 'src', 'preload.ts')],
  outfile: resolve(here, 'dist', 'preload.cjs'),
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});

// The Steam build's game window: Steam's state and the window's fullscreen for the page.
await build({
  ...shared,
  entryPoints: [resolve(here, 'src', 'gamePreload.ts')],
  outfile: resolve(here, 'dist', 'gamePreload.cjs'),
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});

await build({
  ...shared,
  entryPoints: [resolve(here, 'src', 'window.ts')],
  outfile: resolve(here, 'dist', 'window.js'),
  platform: 'browser',
  format: 'esm',
  target: 'chrome130',
});
