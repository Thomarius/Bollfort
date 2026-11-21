import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

import { supporterPlugin, supporterWanted } from './supporterPlugin.js';

const repoRoot = resolve(import.meta.dirname, '..', '..');

/**
 * The version the menu's footer shows (`src/version.ts`, PLAN §11 item 10): the release job's
 * `BOLLFORT_VERSION` (a tag, `v` and all), or else git's description of the tree, or none.
 */
function builtVersion(): string | null {
  const given = process.env.BOLLFORT_VERSION?.trim();
  if (given) return given.replace(/^v/, '');
  try {
    return execFileSync('git', ['describe', '--tags', '--always', '--dirty'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export default defineConfig(({ command }) => ({
  // The private supporter styles, where this build is to carry them (`supporterPlugin.ts`).
  plugins: [supporterPlugin(supporterWanted(command))],
  define: { __BOLLFORT_VERSION__: JSON.stringify(builtVersion()) },
  /**
   * Audio lives in the repository's `assets/` directory, outside this package.
   *
   * Pointing Vite's public directory at it means the same files are served at the same
   * URLs in both worlds: the dev server hands them straight out, and `vite build`
   * copies them into `dist/`, which is exactly what the production server already
   * serves. Neither the server nor the Dockerfile needs to know audio exists.
   *
   * The manifest's `basePath` is `audio` because the contents of this directory are
   * served at the site root, so `assets/audio/sfx/x.ogg` is `/audio/sfx/x.ogg`.
   */
  publicDir: resolve(repoRoot, 'assets'),
  server: {
    // @bollfort/config imports the JSON files in the repository-root config/ directory.
    fs: { allow: [repoRoot] },
  },
  // The bots' worker (`src/bots/botWorker.ts`) imports modules, as the page does.
  worker: { format: 'es' },
  build: {
    target: 'es2023',
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
