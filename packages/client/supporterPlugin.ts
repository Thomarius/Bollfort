import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import type { Plugin } from 'vite';

/*
 * The supporter styles' seam at build time (STEAM.md §6.1, SP1b). The styles are a private
 * repository checked out as `supporter/` in this repository's root — not under `packages/`,
 * whose every folder is a workspace and would be written into the public `package-lock.json`.
 * Where it is to be used, this plugin answers the stub `src/styles/supporter.ts` with that
 * package's entry, `supporter/src/index.ts`; elsewhere the stub stands, and nothing of the
 * package can be loaded at all.
 */

const repoRoot = resolve(import.meta.dirname, '..', '..');
/** The private package's folder, and its entry, which exports the stub's two lists. */
export const SUPPORTER_DIR = resolve(repoRoot, 'supporter');
const ENTRY = resolve(SUPPORTER_DIR, 'src', 'index.ts');
const STUB = resolve(import.meta.dirname, 'src', 'styles', 'supporter.ts');

/** Whether the private package is checked out here. */
export function supporterPresent(): boolean {
  return existsSync(ENTRY);
}

/**
 * Whether a build carries the supporter styles: the dev server and the tests whenever the
 * package is here, since neither ships; a production build only when asked with
 * `BOLLFORT_SUPPORTER=1` (the Steam build's job, later), so nothing built on this machine for
 * a GitHub release or a test session can carry them by accident. Asked without the package,
 * the build fails rather than leaving them out unnoticed.
 */
export function supporterWanted(command: 'serve' | 'build' | 'test'): boolean {
  if (command !== 'build') return supporterPresent();
  if (process.env['BOLLFORT_SUPPORTER'] !== '1') return false;
  if (!supporterPresent()) {
    throw new Error(`BOLLFORT_SUPPORTER=1, but there is no supporter package at ${SUPPORTER_DIR}`);
  }
  return true;
}

export function supporterPlugin(wanted: boolean): Plugin {
  return {
    name: 'bollfort-supporter',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!wanted || importer === undefined || !/(^|\/)supporter(\.js|\.ts)?$/.test(source)) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id === STUB ? ENTRY : null;
    },
    load(id) {
      // Never by another way in either: a stray import of the package fails the build.
      if (!wanted && id.startsWith(SUPPORTER_DIR + sep)) {
        throw new Error(`${id} is the private supporter package, not part of this build`);
      }
      return null;
    },
  };
}
