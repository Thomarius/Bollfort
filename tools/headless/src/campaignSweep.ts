import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs as parseFlags } from 'node:util';

import { CAMPAIGN_DIFFICULTIES } from '@bollfort/config';
import { loadConfigBundle } from '@bollfort/config/node';

import { repoRoot, usageError, wholeNumber } from './cli.js';

/**
 * The campaign's difficulty map (docs/CAMPAIGN.md CA12, the user's, 2026-11-28): every bot level
 * on every level of every difficulty, alone and from a fresh start, at every firepower a team's
 * continues can reach — where a whole campaign shows only how far a bot got, this shows each
 * level's own chance, so a level harder than the next or a firepower that buys nothing stands out.
 *
 *   npx tsx tools/headless/src/campaignSweep.ts --out soaks/campaign-x \
 *     [--bots 2,4,6,8,10] [--difficulties normal,veteran] [--firepower 0,1,2,3,4] \
 *     [--matches 20] [--seed 1] [--workers 4]
 *   npx tsx tools/headless/src/campaignSweep.ts --out soaks/campaign-x --summary
 *   npx tsx tools/headless/src/campaignSweep.ts --out soaks/campaign-x --html [sweep.html]
 *
 * Firepower above 0 is played as a continued level (`--continued`): the shots and first hits of
 * that firepower and the continue's opening cannons, as a level is played again after a continue.
 * Every cell plays the same seeds, so the same maps: a difference across firepower or bots is
 * theirs, not the maps'. A level lost in its first round is free to play again in a campaign, so
 * the summary reads success among the tries that got past it.
 *
 * Each cell is one harness process writing a level table under a temporary name, renamed when it
 * ends: a cell whose file exists is complete and skipped, so the same command carries on after a
 * stop. The folder remembers its commits and warns when they mix.
 *
 * `--html` writes the folder's cells as one page beside them (`sweep.html` unless named; a run
 * writes it as it ends): a heatmap
 * per difficulty and each bot's curve across the levels or the firepower, from
 * `campaignSweep.html` with the cells put in for its `__DATA__`, so it opens with no server.
 */

const tsx = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const harness = join(repoRoot, 'tools', 'headless', 'src', 'main.ts');
const fromCwd = (path: string): string => resolve(process.env['INIT_CWD'] ?? process.cwd(), path);

const FLAGS = {
  out: { type: 'string' },
  bots: { type: 'string' },
  difficulties: { type: 'string' },
  firepower: { type: 'string' },
  matches: { type: 'string' },
  seed: { type: 'string' },
  workers: { type: 'string' },
  summary: { type: 'boolean' },
  html: { type: 'boolean' },
} as const;

const { values, positionals } = (() => {
  try {
    return parseFlags({
      args: process.argv.slice(2),
      options: FLAGS,
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    usageError(`${(error as Error).message}; see the head of tools/headless/src/campaignSweep.ts`);
  }
})();
if (values.out === undefined) usageError('--out wants a folder');
const out = fromCwd(values.out);

if (values.summary === true) {
  console.log(summary(out));
  process.exit(0);
}
if (values.html === true) {
  const page = join(out, positionals[0] ?? 'sweep.html');
  writeFileSync(page, html(out));
  console.log(`wrote ${page}`);
  process.exit(0);
}
if (positionals.length > 0) usageError(`unexpected ${positionals.join(' ')}`);

const list = (flag: string, value: string, min: number): number[] =>
  value.split(',').map((v) => wholeNumber(flag, v, min));
const bots = list('bots', values.bots ?? '2,4,6,8,10', 1);
const firepowers = list('firepower', values.firepower ?? '0,1,2,3,4', 0);
const difficulties = (values.difficulties ?? CAMPAIGN_DIFFICULTIES.join(',')).split(',');
for (const d of difficulties) {
  if (!(CAMPAIGN_DIFFICULTIES as readonly string[]).includes(d)) {
    usageError(`--difficulties wants ${CAMPAIGN_DIFFICULTIES.join(', ')}`);
  }
}
const matches = wholeNumber('matches', values.matches ?? '20', 1);
const seed = wholeNumber('seed', values.seed ?? '1', 0);
const workers = wholeNumber('workers', values.workers ?? String(cpus().length), 1);
const config = loadConfigBundle(repoRoot).campaign;

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot })
  .toString()
  .trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot }).length > 0;
mkdirSync(out, { recursive: true });
const stamp = `${commit}${dirty ? '-dirty' : ''}`;
const commitFile = join(out, 'commits.txt');
const commits = existsSync(commitFile) ? readFileSync(commitFile, 'utf8').split('\n') : [];
if (!commits.includes(stamp)) {
  writeFileSync(commitFile, [...commits, stamp].join('\n').trim() + '\n');
}
if (commits.filter((c) => c !== '').some((c) => c !== stamp)) {
  console.warn(`warning: ${out} also holds cells from ${commits.join(' ')}`);
}

interface Cell {
  name: string;
  args: string[];
}

const cells: Cell[] = [];
for (const difficulty of difficulties) {
  // Each level the difficulty plays, once: Veteran's and Legend's fifth comes twice, alike.
  const order = config.difficulties[difficulty as keyof typeof config.difficulties].levelOrder;
  for (const level of [...new Set(order)]) {
    for (const firepower of firepowers) {
      for (const bot of bots) {
        cells.push({
          name: `${difficulty}-C${level + 1}-F${firepower}-L${bot}`,
          args: [
            ...['--campaign', String(level + 1), '--difficulty', difficulty],
            ...['--level', String(bot), '--matches', String(matches), '--seed', String(seed)],
            ...['--firepower', String(firepower)],
            ...(firepower > 0 ? ['--continued'] : []),
          ],
        });
      }
    }
  }
}
const todo = cells.filter((c) => !existsSync(join(out, `${c.name}.levels.csv`)));
console.log(`${cells.length - todo.length} of ${cells.length} cells done; ${workers} workers`);

const started = Date.now();
let done = 0;
await Promise.all(
  Array.from({ length: Math.min(workers, todo.length) }, async () => {
    for (let cell = todo.shift(); cell !== undefined; cell = todo.shift()) {
      const file = join(out, `${cell.name}.levels.csv`);
      const code = await new Promise<number | null>((ok) => {
        const child = spawn(
          process.execPath,
          [tsx, harness, ...cell.args, '--level-table', `${file}.part`],
          { cwd: repoRoot, stdio: 'ignore' },
        );
        child.on('close', ok);
      });
      if (code !== 0) {
        console.error(`${cell.name} failed (exit ${code})`);
        continue;
      }
      renameSync(`${file}.part`, file);
      done++;
      const minutes = ((Date.now() - started) / 60_000).toFixed(1);
      console.log(`${cell.name} (${done} this run, ${minutes} min)`);
    }
  }),
);
console.log(`\n${summary(out)}`);
writeFileSync(join(out, 'sweep.html'), html(out));
console.log(`\nthe page: ${join(out, 'sweep.html')}`);

interface Tally {
  difficulty: string;
  /** The campaign level, from 1. */
  level: number;
  firepower: number;
  bot: number;
  played: number;
  /** Lost in the first round: a free try again in a campaign, so left out of the share. */
  lostFirst: number;
  /** Lost in a later round. */
  lost: number;
  cleared: number;
  /** Totals over the tries, divided by `played` where shown. */
  rounds: number;
  gruntsLanded: number;
  shipsArrived: number;
}

/** Every finished cell in the folder, tallied from its level table. */
function tallies(dir: string): Tally[] {
  const all: Tally[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.levels.csv'))) {
    const match = /^(\w+)-C(\d+)-F(\d+)-L(\d+)\.levels\.csv$/.exec(file);
    if (match === null) continue;
    const [, difficulty, level, firepower, bot] = match as unknown as string[];
    const [header, ...lines] = readFileSync(join(dir, file), 'utf8').trim().split('\n');
    const columns = (header ?? '').split(',');
    const tally: Tally = {
      difficulty: difficulty as string,
      level: Number(level),
      firepower: Number(firepower),
      bot: Number(bot),
      played: 0,
      lostFirst: 0,
      lost: 0,
      cleared: 0,
      rounds: 0,
      gruntsLanded: 0,
      shipsArrived: 0,
    };
    for (const line of lines) {
      const cells = line.split(',');
      const get = (name: string): string => cells[columns.indexOf(name)] ?? '';
      const end = get('end');
      const rounds = Number(get('rounds'));
      tally.played++;
      tally.rounds += rounds;
      tally.gruntsLanded += Number(get('gruntsLanded'));
      tally.shipsArrived +=
        Number(get('raidersArrived')) +
        Number(get('transportsArrived')) +
        Number(get('frostshipsArrived'));
      if (end === 'lost' && rounds <= 1) tally.lostFirst++;
      else if (end === 'lost') tally.lost++;
      else if (end === 'threat' || end === 'round_limit') tally.cleared++;
    }
    all.push(tally);
  }
  return all;
}

/** The page: the template with the cells, averaged per try, in place of its `__DATA__`. */
function html(dir: string): string {
  const per = (total: number, t: Tally): number => Math.round((10 * total) / t.played) / 10;
  const cells = tallies(dir).map((t) => ({
    d: t.difficulty,
    lv: t.level,
    fp: t.firepower,
    bot: t.bot,
    n: t.played,
    lostFirst: t.lostFirst,
    lost: t.lost,
    cleared: t.cleared,
    rounds: per(t.rounds, t),
    grunts: per(t.gruntsLanded, t),
    arrived: per(t.shipsArrived, t),
  }));
  const template = readFileSync(
    join(repoRoot, 'tools', 'headless', 'src', 'campaignSweep.html'),
    'utf8',
  );
  // A function, so a `$` in the data is never read as a replacement pattern.
  return template.replace('__DATA__', () => JSON.stringify(cells));
}

/**
 * A table per difficulty: a row per level and bot, a column per firepower, each cell the share of
 * tries cleared among those past the first round, and the first round's losses where there were.
 */
function summary(dir: string): string {
  const byKey = new Map<string, Tally>();
  const keys = { difficulty: new Set<string>(), level: new Set<number>() };
  const bots = new Set<number>();
  const firepowers = new Set<number>();
  for (const t of tallies(dir)) {
    byKey.set(`${t.difficulty}|${t.level}|${t.firepower}|${t.bot}`, t);
    keys.difficulty.add(t.difficulty);
    keys.level.add(t.level);
    bots.add(t.bot);
    firepowers.add(t.firepower);
  }
  const sorted = <T>(set: Set<T>): T[] => [...set].sort((a, b) => (a < b ? -1 : 1));
  const fps = sorted(firepowers);
  const lines = [
    'cleared, as a share of the tries past their first round (first-round losses in brackets);',
    "firepower above 0 is a continued level, with the continue's opening cannons",
  ];
  const order = CAMPAIGN_DIFFICULTIES.filter((d) => keys.difficulty.has(d));
  for (const difficulty of order) {
    lines.push(
      '',
      `${difficulty}`,
      `  level bot  ${fps.map((f) => `   FP${f}  `).join('')}  rounds at FP${fps[0]}`,
    );
    for (const level of sorted(keys.level)) {
      for (const bot of sorted(bots)) {
        const row = fps.map((f) => byKey.get(`${difficulty}|${level}|${f}|${bot}`));
        if (row.every((t) => t === undefined)) continue;
        const cell = (t: Tally | undefined): string => {
          if (t === undefined) return '    —    ';
          const past = t.played - t.lostFirst;
          const share = past === 0 ? '  —' : `${Math.round((100 * t.cleared) / past)}%`.padStart(4);
          const first = t.lostFirst > 0 ? `(${t.lostFirst})`.padEnd(4) : '    ';
          return ` ${share}${first}`;
        };
        const first = row.find((t) => t !== undefined) as Tally;
        lines.push(
          `  ${String(level).padStart(5)} L${String(bot).padEnd(3)}${row.map(cell).join('')}` +
            `  ${(first.rounds / first.played).toFixed(1)}`,
        );
      }
    }
  }
  return lines.join('\n');
}
