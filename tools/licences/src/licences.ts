// The third-party licences of what the game ships (STEAM.md §9.2): every npm package whose code
// ends up in a build, found by bundling as the builds do and reading which files went in — not
// from the lockfile, whose production tree is nearly four times as long (koffi's builds for
// twenty systems, type packages, the parts of libp2p tree-shaking drops; measured 2026-11-09:
// 75 packages against the desktop bundle's 20). `npm run licences` writes the list as
// THIRD_PARTY_LICENSES.md, which the desktop app carries; a test fails when it is stale.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { build as esbuild } from 'esbuild';
import { build as viteBuild, type Plugin } from 'vite';

export const REPO = path.resolve(import.meta.dirname, '../../..');
const CLIENT = path.join(REPO, 'packages/client');
const DESKTOP = path.join(REPO, 'packages/desktop');

/** Where a package is shipped, from the widest to the narrowest. */
export type Part = 'page' | 'app' | 'steam';
const PART_NAMES: Record<Part, string> = {
  page: 'the game (every build)',
  app: 'the desktop app and the server',
  steam: 'the Steam build',
};

export interface Shipped {
  name: string;
  version: string;
  /** The SPDX expression in its package.json. */
  licence: string;
  url: string | null;
  /** The licence's text: its own file, or the one named in `BORROWED`. */
  text: string;
  /** Where its text came from, when not its own file. */
  textFrom: string | null;
  parts: Part[];
}

/**
 * Shipped beside the app as they are, not bundled (`package.js`'s `STEAM_ONLY`): the Steam
 * build's native modules. koffi's binary for each system is a package of its own, of which
 * only Windows' and Linux's x64 builds are packaged.
 */
const UNPACKED = ['steamworks.js', 'koffi', '@koromix/koffi-linux-x64', '@koromix/koffi-win32-x64'];

/**
 * Packages published without a licence's text, and the text that covers them: another
 * package's, or one kept in `tools/licences/texts/` from the original's repository.
 */
const BORROWED: Record<string, { from: string; package?: string; file?: string }> = {
  // koffi's per-system binaries, published by koffi's author under koffi's licence.
  '@koromix/koffi-linux-x64': { from: "koffi's", package: 'koffi' },
  '@koromix/koffi-win32-x64': { from: "koffi's", package: 'koffi' },
  // Pixi's fork of colord, MIT by its package.json, which names the original's repository;
  // its LICENSE.md fetched from github.com/omgovich/colord (2026-11-09).
  '@pixi/colord': { from: "colord's, the original it was forked from", file: 'colord.txt' },
  // Dual-licensed Apache-2.0 OR MIT, taken under MIT: each repository's LICENSE-MIT (2026-11-09).
  '@achingbrain/nat-port-mapper': {
    from: "its repository's MIT text",
    file: 'achingbrain-nat-port-mapper.txt',
  },
  '@achingbrain/ssdp': { from: "its repository's MIT text", file: 'achingbrain-ssdp.txt' },
  '@libp2p/logger': { from: "its repository's MIT text", file: 'libp2p-logger.txt' },
  'race-signal': { from: "its repository's MIT text", file: 'achingbrain-race-signal.txt' },
  weald: { from: "its repository's MIT text", file: 'achingbrain-weald.txt' },
  // Their own LICENSE only says they are dual licensed; the MIT text from their repositories.
  'freeport-promise': {
    from: "its repository's MIT text",
    file: 'achingbrain-freeport-promise.txt',
  },
  multiformats: { from: "its repository's MIT text", file: 'multiformats.txt' },
  // No licence file in its repository either; its README: "Released under the MIT License".
  // The MIT text, the holder its package.json's author.
  'err-code': {
    from: "the MIT License's, which its README names, its author the holder",
    file: 'err-code.txt',
  },
};

/** The package directory a bundled file belongs to, or null for our own code. */
export function packageDir(file: string): string | null {
  const norm = file.replaceAll('\\', '/').replace(/^\0/, '').replace(/\?.*$/, '');
  const at = norm.lastIndexOf('/node_modules/');
  if (at < 0) return null;
  const head = norm.slice(0, at + '/node_modules/'.length);
  const rest = norm.slice(head.length).split('/');
  const name = rest[0]?.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  if (name === undefined || name.startsWith('@bollfort/')) return null;
  return head + name;
}

/** Every module the client's build takes in, its worker and its styles' modules included. */
async function clientFiles(): Promise<string[]> {
  const ids = new Set<string>();
  const collect = (): Plugin => ({
    name: 'licences-collect',
    generateBundle() {
      for (const id of this.getModuleIds()) ids.add(id);
    },
  });
  await viteBuild({
    root: CLIENT,
    configFile: path.join(CLIENT, 'vite.config.ts'),
    logLevel: 'silent',
    publicDir: false,
    build: { write: false },
    plugins: [collect()],
    worker: { format: 'es', plugins: () => [collect()] },
  });
  return [...ids];
}

/** Every file esbuild takes into one of the builds' bundles, as `build.js` makes them. */
async function bundled(entry: string, platform: 'node' | 'browser', steam = false) {
  const result = await esbuild({
    entryPoints: [entry],
    absWorkingDir: REPO,
    bundle: true,
    write: false,
    metafile: true,
    logLevel: 'silent',
    platform,
    format: 'esm',
    define: { __BOLLFORT_COMMIT__: 'null', __BOLLFORT_STEAM__: JSON.stringify(steam) },
    external: ['electron', 'bufferutil', 'utf-8-validate', 'steamworks.js'],
  });
  return Object.keys(result.metafile.inputs).map((input) => path.resolve(REPO, input));
}

/** The desktop app's processes and windows, both builds; the server's image is within it. */
async function appFiles(): Promise<string[]> {
  const src = (name: string) => path.join(DESKTOP, 'src', name);
  const runs = await Promise.all([
    bundled(src('entry.ts'), 'node', false),
    bundled(src('entry.ts'), 'node', true),
    bundled(src('preload.ts'), 'node'),
    bundled(src('gamePreload.ts'), 'node'),
    bundled(src('window.ts'), 'browser'),
    bundled(path.join(REPO, 'packages/server/src/main.ts'), 'node'),
  ]);
  return runs.flat();
}

const LICENCE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$|^licen[cs]e-mit/i;

function licenceText(dir: string): string | null {
  const file = readdirSync(dir).find((f) => LICENCE_FILE.test(f));
  return file === undefined ? null : readFileSync(path.join(dir, file), 'utf8').trim();
}

interface PackageJson {
  name: string;
  version: string;
  license?: string;
  homepage?: string;
  repository?: string | { url?: string };
}

/**
 * A package's own package.json, or for another system's binary, which npm installs only there
 * (koffi's for Windows, on Linux), its entry in the lockfile: the same version and licence.
 */
function packageJson(dir: string): PackageJson {
  if (existsSync(dir)) return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const key = path.relative(REPO, dir).replaceAll('\\', '/');
  const lock = JSON.parse(readFileSync(path.join(REPO, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, { version?: string; license?: string } | undefined>;
  };
  const entry = lock.packages[key];
  if (entry?.version === undefined) throw new Error(`${key}: not installed, nor in the lockfile`);
  return {
    name: key.slice('node_modules/'.length),
    version: entry.version,
    ...(entry.license === undefined ? {} : { license: entry.license }),
  };
}

function describe(dir: string, parts: Part[]): Shipped {
  const json = packageJson(dir);
  const lender = BORROWED[json.name];
  let text = existsSync(dir) && lender === undefined ? licenceText(dir) : null;
  let textFrom: string | null = null;
  if (lender !== undefined) {
    if (lender.package !== undefined)
      text = licenceText(path.join(REPO, 'node_modules', lender.package));
    if (lender.file !== undefined)
      text = readFileSync(
        path.join(import.meta.dirname, '..', 'texts', lender.file),
        'utf8',
      ).trim();
    textFrom = lender.from;
  }
  if (text === null) throw new Error(`${json.name}: no licence file, and none borrowed`);
  const repo = typeof json.repository === 'string' ? json.repository : json.repository?.url;
  const url =
    json.homepage ??
    repo
      ?.replace(/^git\+/, '')
      .replace(/\.git$/, '')
      .replace(/^git:\/\//, 'https://')
      .replace(/^github:/, 'https://github.com/')
      .replace(/^([\w-]+\/[\w.-]+)$/, 'https://github.com/$1') ??
    null;
  return {
    name: json.name,
    version: json.version,
    licence: json.license ?? 'see its text',
    url,
    text,
    textFrom,
    parts,
  };
}

/** Every third-party package the builds ship, by name, with where each goes. */
export async function shippedPackages(): Promise<Shipped[]> {
  const found = new Map<string, Set<Part>>();
  const add = (files: string[], part: Part) => {
    for (const file of files) {
      const dir = packageDir(file);
      if (dir === null) continue;
      const real = realpathSync(dir);
      found.set(real, (found.get(real) ?? new Set()).add(part));
    }
  };
  const [page, app] = await Promise.all([clientFiles(), appFiles()]);
  add(page, 'page');
  add(app, 'app');
  for (const name of UNPACKED) {
    const dir = path.join(REPO, 'node_modules', name);
    const key = existsSync(dir) ? realpathSync(dir) : dir;
    found.set(key, (found.get(key) ?? new Set()).add('steam'));
  }
  const order: Part[] = ['page', 'app', 'steam'];
  return [...found]
    .map(([dir, parts]) =>
      describe(
        dir,
        order.filter((p) => parts.has(p)),
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** THIRD_PARTY_LICENSES.md: a table, then each licence's text whole, as the licences ask. */
export function noticesMarkdown(packages: readonly Shipped[]): string {
  const row = (p: Shipped) =>
    `| [${p.name}](#${anchor(p.name)}) | ${p.version} | ${p.licence} | ${p.parts.map((x) => PART_NAMES[x]).join(', ')} |`;
  const section = (p: Shipped) =>
    [
      `## ${p.name}`,
      '',
      `Version ${p.version}, ${p.licence}${p.url === null ? '' : `, ${p.url}`}.` +
        (p.textFrom === null ? '' : ` The text is ${p.textFrom}.`),
      '',
      '```text',
      p.text,
      '```',
    ].join('\n');
  return [
    '# Third-party licences',
    '',
    '<!-- Written by `npm run licences` (tools/licences) from what the builds bundle; do not edit. -->',
    '',
    "Bollfort's own code is under the MIT licence (`LICENSE`). Beside it the builds carry the",
    'open-source packages below, each under its own licence, its text in full further down. Its',
    'sounds and music are credited in `CREDITS.md`, its two fonts, Inter and Rubik, under the SIL',
    'Open Font License (their packages below, and `assets/fonts/`).',
    '',
    "The desktop app is built on **Electron**, whose licence and Chromium's and their own",
    "components' are beside the app as `LICENSE.electron.txt` and `LICENSES.chromium.html`. The",
    "Steam build calls **Steam's API** through `steamworks.js`, with Valve's library",
    '(`steam_api64.dll`, `libsteam_api.so`), redistributed under the Steamworks SDK Access',
    'Agreement; Steam and the Steam logo are trademarks of Valve Corporation.',
    '',
    '| Package | Version | Licence | Shipped in |',
    '| ------- | ------- | ------- | ---------- |',
    ...packages.map(row),
    '',
    ...packages.map(section).flatMap((s) => [s, '']),
  ].join('\n');
}

/** GitHub's heading anchors: lower case, spaces to dashes, all else but word characters gone. */
function anchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, '')
    .replace(/ /g, '-');
}
