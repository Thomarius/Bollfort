/* global process, console */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Packages the desktop app for the system this runs on (PLAN 11.17 A3): a portable .exe on
 * Windows, an AppImage on Linux, into `release/`. Each is built on its own system, here or
 * in CI on demand (A4); it wants `npm run build` at the repository root first, for the
 * client it carries. `BOLLFORT_VERSION` sets the release's version, as a tag does in CI.
 *
 * With `BOLLFORT_STEAM=1` (STEAM.md §3.5, S2) the Steam build instead: a plain folder, as a
 * Steam depot takes it, in `release/steam/`, with `steamworks.js` and `koffi` (the avatars'
 * FFI, STEAM.md §7.3) unpacked beside the app — and never a `steam_appid.txt`, which only
 * development may have. Every other build leaves both out.
 */
const STEAM_ONLY = [
  '**/node_modules/steamworks.js/**',
  '**/node_modules/koffi/**',
  '**/node_modules/@koromix/**',
];
const steam = process.env.BOLLFORT_STEAM === '1';
const target = { win32: '--win', linux: '--linux' }[process.platform];
if (target === undefined) {
  console.error(`no portable build for ${process.platform}: only Windows and Linux are made`);
  process.exit(1);
}
const version = process.env.BOLLFORT_VERSION?.trim();
const here = import.meta.dirname;
const output = join(here, 'release', steam ? 'steam' : '.');

/**
 * The config, from package.json's `build`, written out for this build: the Steam build a
 * folder with steamworks.js and koffi unpacked beside the app; every other build without them.
 */
const base = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).build;
const config = steam
  ? {
      ...base,
      directories: { output },
      asarUnpack: STEAM_ONLY,
      win: { ...base.win, target: ['dir'] },
      linux: { ...base.linux, target: ['dir'] },
    }
  : { ...base, files: [...base.files, ...STEAM_ONLY.map((glob) => `!${glob}`)] };
mkdirSync(output, { recursive: true });
const configFile = join(output, 'builder-config.json');
writeFileSync(configFile, JSON.stringify(config, null, 2));

execFileSync(
  'npx',
  [
    'electron-builder',
    target,
    '--publish',
    'never',
    '--config',
    configFile,
    ...(version ? [`-c.extraMetadata.version=${version}`] : []),
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

if (steam) {
  /** Every file under a folder, so a steam_appid.txt anywhere in the build is found. */
  const files = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  const found = existsSync(output)
    ? files(output).filter((f) => f.endsWith('steam_appid.txt'))
    : [];
  if (found.length > 0) {
    console.error(
      `a Steam build must never ship steam_appid.txt (STEAM.md §3.1): ${found.join(', ')}`,
    );
    process.exit(1);
  }
}
