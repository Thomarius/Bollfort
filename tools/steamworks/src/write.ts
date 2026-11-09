// The files Steamworks takes (STEAM.md §9.2):
//
//   npx tsx tools/steamworks/src/write.ts presence
//     assets/steam/rich_presence_<language>.vdf, from config/locale/ — upload each in
//     Steamworks → Community → Rich Presence; a test fails when they are stale.
//   npx tsx tools/steamworks/src/write.ts app-build --app N --depot N:FOLDER [--depot …]
//       --root DIR --out FILE [--branch beta] [--desc TEXT] [--preview]
//     the app build script for `steamcmd +run_app_build`, as the release job writes it.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { appBuildVdf } from './appBuild.js';
import { PRESENCE_DIR, presenceFiles } from './presenceFiles.js';

const [command, ...args] = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const all = (name: string): string[] =>
  args.flatMap((a, i) => (a === `--${name}` && args[i + 1] !== undefined ? [args[i + 1]!] : []));
const need = (name: string): string => {
  const value = opt(name);
  if (value === undefined || value === '') throw new Error(`--${name} is needed`);
  return value;
};

if (command === 'presence') {
  mkdirSync(PRESENCE_DIR, { recursive: true });
  for (const file of presenceFiles()) {
    writeFileSync(path.join(PRESENCE_DIR, file.name), file.text);
    process.stdout.write(`wrote ${path.join(PRESENCE_DIR, file.name)}\n`);
  }
} else if (command === 'app-build') {
  const out = path.resolve(need('out'));
  const depots = all('depot').map((d) => {
    const [id, folder] = d.split(':');
    if (id === undefined || folder === undefined) throw new Error(`--depot ${d}: ID:FOLDER`);
    return { id, folder };
  });
  if (depots.length === 0) throw new Error('--depot ID:FOLDER is needed, once a system');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(
    out,
    appBuildVdf({
      appId: need('app'),
      depots,
      branch: opt('branch') ?? 'beta',
      desc: opt('desc') ?? 'Bollfort',
      contentRoot: path.resolve(need('root')),
      buildOutput: path.join(path.dirname(out), 'output'),
      preview: args.includes('--preview'),
    }),
  );
  process.stdout.write(`wrote ${out}\n`);
} else {
  throw new Error('write.ts presence | app-build …');
}
