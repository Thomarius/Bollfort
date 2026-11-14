import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

import { normalizePath, type Plugin } from 'vite';

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
/**
 * Vite's module ids have forward slashes on Windows too, where `resolve` gives backslashes: both
 * are compared as Vite writes them, or the stub is never answered there, and the guard below
 * never fires.
 */
const STUB_ID = normalizePath(STUB);
const ENTRY_ID = normalizePath(ENTRY);
const DIR_ID = normalizePath(SUPPORTER_DIR) + '/';
/**
 * The package's own files — its styles' music, and pictures — laid out as the public `assets/`
 * is and served beside it at the same URLs: `supporter/assets/audio/music/styles/x.mp3` is
 * `/audio/music/styles/x.mp3`, as the public tracks are, so a style names its track as any does.
 */
export const SUPPORTER_ASSETS = resolve(SUPPORTER_DIR, 'assets');
const PUBLIC_ASSETS = resolve(repoRoot, 'assets');

/** The package's files, by their path under `assets/` with forward slashes. */
export function supporterAssets(): string[] {
  if (!existsSync(SUPPORTER_ASSETS)) return [];
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
    );
  return walk(SUPPORTER_ASSETS).map((path) =>
    relative(SUPPORTER_ASSETS, path).split(sep).join('/'),
  );
}

/** A file of the package's shadowing a public one would change the free game's: refused. */
function assetClashes(): string[] {
  return supporterAssets().filter((path) => existsSync(join(PUBLIC_ASSETS, path)));
}

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

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
    buildStart() {
      if (!wanted) return;
      const clashes = assetClashes();
      if (clashes.length > 0) {
        throw new Error(`the supporter package's files shadow public ones: ${clashes.join(', ')}`);
      }
    },
    // The dev server: the package's files where a request names one, before the public folder.
    configureServer(server) {
      if (!wanted) return;
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        let path: string;
        try {
          path = decodeURIComponent((req.url ?? '').split('?')[0]!);
        } catch {
          return next();
        }
        const file = resolve(SUPPORTER_ASSETS, '.' + path);
        if (
          !file.startsWith(SUPPORTER_ASSETS + sep) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          return next();
        }
        res.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Content-Length', statSync(file).size);
        res.setHeader('Cache-Control', 'no-cache');
        if (req.method === 'HEAD') return res.end();
        createReadStream(file).pipe(res);
      });
    },
    // A build carrying the styles: their files into `dist/` beside the public ones.
    generateBundle() {
      if (!wanted) return;
      for (const path of supporterAssets()) {
        this.emitFile({
          type: 'asset',
          fileName: path,
          source: readFileSync(join(SUPPORTER_ASSETS, path)),
        });
      }
    },
    async resolveId(source, importer, options) {
      if (!wanted || importer === undefined || !/(^|\/)supporter(\.js|\.ts)?$/.test(source)) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved !== null && normalizePath(resolved.id) === STUB_ID ? ENTRY_ID : null;
    },
    load(id) {
      // Never by another way in either: a stray import of the package fails the build.
      if (!wanted && normalizePath(id).startsWith(DIR_ID)) {
        throw new Error(`${id} is the private supporter package, not part of this build`);
      }
      return null;
    },
  };
}
