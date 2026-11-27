/* global process */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * `npm run desktop:supporter`: the desktop app from the repository with the supporter styles
 * (STEAM.md §6.1). The client is built with `BOLLFORT_SUPPORTER=1` into its own folder,
 * `dist-supporter` (`src/devStart.ts`), never `dist`, which a later `npm run package` would ship;
 * then the app starts on it with `--supporter`. A script rather than a line in `package.json`,
 * because npm runs scripts through cmd on Windows, which has no `VAR=1 command`.
 */
const root = resolve(import.meta.dirname, '..', '..');
const run = (command, env = process.env) => execSync(command, { cwd: root, stdio: 'inherit', env });

run('npm run build -w @bollfort/client -- --outDir dist-supporter', {
  ...process.env,
  BOLLFORT_SUPPORTER: '1',
});
const extra = process.argv.slice(2).join(' ');
run(`npm start -w @bollfort/desktop -- --supporter ${extra}`.trim());
