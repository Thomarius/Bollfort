/**
 * Desktop wallpapers from the game itself, through the client's store-art mode
 * (`client/src/storeArt.ts`), the same camera as the Steam capsules (`storeArt.ts`), with a
 * contact sheet to choose from.
 *
 *   npm run dev -w @bollfort/client                    # in another terminal
 *   npm run wallpapers -w @bollfort/storeart -- [outdir] [design…] [--size 2560x1440]
 *   npm run wallpapers -w @bollfort/storeart -- [outdir] --all-splits [--supporter] [--parallel 2]
 *
 * Two kinds: the capsules' look at a desktop's size, the board to every edge; and designs for a
 * black desktop (`&fade=`), the board fading to pure black at the edges so the picture meets a
 * black screen's border with no seam.
 *
 * `--all-splits` renders the user's favourite, `black-oval` (2026-11-22), for every ordered pair
 * of different styles, one above the line and one below: 24 × 23 = 552, or with `--supporter`
 * (the private package checked out as `supporter/`) 34 × 33 = 1122, about 11 s each one at a
 * time. The styles are asked of the page itself, so the list is always the menu's. A wallpaper
 * already on disk is skipped, so a stopped run is resumed by starting it again; one that fails is
 * tried again at the end and listed if it still fails. `--parallel N` renders N pages at once;
 * `--limit N` makes only the next N, for a trial; styles named after the folder, only the pairs
 * with one of them.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium, type Browser } from 'playwright';

const BASE = process.env['BASE'] ?? 'http://localhost:5173';
const args = process.argv.slice(2);

/** Takes `--name` from the arguments, with its value if it has one. */
function option(name: string, hasValue: false): boolean;
function option(name: string, hasValue: true): string | undefined;
function option(name: string, hasValue: boolean): boolean | string | undefined {
  const at = args.indexOf(name);
  if (at < 0) return hasValue ? undefined : false;
  const [, value] = args.splice(at, hasValue ? 2 : 1);
  return hasValue ? value : true;
}

const [WIDTH, HEIGHT] = (option('--size', true) ?? '2560x1440').split('x').map(Number) as [
  number,
  number,
];
const ALL_SPLITS = option('--all-splits', false);
const SUPPORTER = option('--supporter', false);
const PARALLEL = Math.max(1, Number(option('--parallel', true) ?? 1));
/** At most this many made in this run, for a trial. */
const LIMIT = Number(option('--limit', true) ?? Infinity);
const OUT = resolve(args[0] ?? '/tmp/wallpapers');
const ONLY = args.slice(1);

interface Design {
  name: string;
  note: string;
  /** The combat look, below the line of a change of look or the whole board. */
  board: string;
  /** The build look above the line, or none for one look. */
  above?: string;
  players: number;
  seed: number;
  round: number;
  title: 'center' | 'top' | 'bottom' | 'none';
  titleWidth: number;
  /** A dark veil behind the title, for a board to the edges. */
  shade?: boolean;
  fade?: 'radial' | 'frame' | 'low' | 'band';
  lettering?: string;
}

const DESIGNS: Design[] = [
  // The Steam capsules' look at a desktop's size.
  {
    name: 'capsule',
    note: 'The store capsules: Cyberpunk above the line, Medieval below',
    board: 'pixel',
    above: 'cyberpunk',
    players: 2,
    seed: 7,
    round: 3,
    title: 'center',
    titleWidth: 0.5,
    shade: true,
  },
  {
    name: 'medieval',
    note: 'Medieval alone, the title over it',
    board: 'pixel',
    players: 2,
    seed: 7,
    round: 3,
    title: 'center',
    titleWidth: 0.5,
    shade: true,
  },
  {
    name: 'eight',
    note: 'Eight islands, no title',
    board: 'pixel',
    above: 'cyberpunk',
    players: 8,
    seed: 3,
    round: 4,
    title: 'none',
    titleWidth: 0,
  },
  // For a black desktop.
  {
    name: 'black-oval',
    note: 'Black desktop: an oval of board, the split, title in the middle',
    board: 'pixel',
    above: 'cyberpunk',
    players: 2,
    seed: 7,
    round: 3,
    title: 'center',
    titleWidth: 0.45,
    fade: 'radial',
  },
  {
    name: 'black-frame',
    note: 'Black desktop: the whole board, every edge faded',
    board: 'pixel',
    players: 4,
    seed: 5,
    round: 4,
    title: 'center',
    titleWidth: 0.45,
    shade: true,
    fade: 'frame',
  },
  {
    name: 'black-rising',
    note: 'Black desktop: the board rising from below, the title on black above',
    board: 'pixel',
    players: 2,
    seed: 7,
    round: 3,
    title: 'top',
    titleWidth: 0.42,
    fade: 'low',
  },
  {
    name: 'black-band',
    note: 'Black desktop: a band of board across the middle, the title over it',
    board: 'pixel',
    players: 2,
    seed: 11,
    round: 3,
    title: 'center',
    titleWidth: 0.45,
    shade: true,
    fade: 'band',
  },
  {
    name: 'black-night',
    note: 'Black desktop: Night, already dark, in an oval',
    board: 'night',
    players: 2,
    seed: 7,
    round: 3,
    title: 'center',
    titleWidth: 0.45,
    fade: 'radial',
  },
  {
    name: 'black-cyberpunk',
    note: 'Black desktop: Cyberpunk alone in an oval, its neon on black',
    board: 'cyberpunk',
    players: 4,
    seed: 5,
    round: 4,
    title: 'center',
    titleWidth: 0.45,
    fade: 'radial',
  },
];

function sceneUrl(d: Design): string {
  const q = new URLSearchParams({
    storeArt: 'scene',
    autostart: '1',
    watch: '1',
    players: String(d.players),
    level: '8',
    seed: String(d.seed),
    snapshot: 'combat',
    round: String(d.round),
    combatStyle: d.board,
    buildStyle: d.above ?? d.board,
    titleStyle: d.lettering ?? 'flat',
    title: d.title,
    titleWidth: String(d.titleWidth),
    lang: 'en',
  });
  if (d.shade) q.set('shade', '1');
  if (d.fade) q.set('fade', d.fade);
  if (d.above) q.set('split', '0.5');
  return `${BASE}/?${q}`;
}

interface Job {
  file: string;
  url: string;
  label: string;
}

async function shoot(browser: Browser, job: Job): Promise<void> {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  try {
    page.on('pageerror', (e) => console.error(`  ${job.file}: page error: ${e.message}`));
    await page.goto(job.url);
    await page.waitForFunction(
      () => document.documentElement.dataset['storeArt'] === 'ready',
      null,
      { timeout: 90_000 },
    );
    // As the capsules wait: a few seconds into combat, shots in the air.
    await page.waitForTimeout(7500);
    // Written aside and then renamed, so a run stopped mid-write leaves no half file that a
    // resumed run would take as done.
    const part = join(OUT, `${job.file}.part.png`);
    await page.screenshot({ path: part });
    renameSync(part, join(OUT, job.file));
  } finally {
    await page.close();
  }
}

/** Every style the page offers, in the menu's order, as Vite serves the client's own module. */
async function styleIds(browser: Browser): Promise<string[]> {
  const page = await browser.newPage();
  await page.goto(`${BASE}/${SUPPORTER ? '?supporter=1' : ''}`);
  const ids = await page.evaluate(async () => {
    const path = '/src/styles/registry.ts';
    const registry = (await import(/* @vite-ignore */ path)) as { STYLE_IDS: string[] };
    return [...registry.STYLE_IDS];
  });
  await page.close();
  return ids;
}

mkdirSync(OUT, { recursive: true });
// `--use-angle=gl` is what renders the GPU's frames headless on Linux; Windows' own ANGLE
// backend, Direct3D, is its default and needs nothing asked.
const browser = await chromium.launch({
  args: [
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    ...(process.platform === 'win32' ? [] : ['--use-angle=gl']),
  ],
});

const jobs: Job[] = [];
if (ALL_SPLITS) {
  const oval = DESIGNS.find((d) => d.name === 'black-oval')!;
  const ids = await styleIds(browser);
  const pairs = ids.length * (ids.length - 1);
  console.log(`${ids.length} styles, ${pairs} wallpapers: ${ids.join(', ')}`);
  if (SUPPORTER && ids.length < 34) {
    console.error('Fewer than 34 styles: is the supporter package checked out as supporter/?');
    process.exit(1);
  }
  for (const above of ids) {
    for (const below of ids) {
      if (above === below) continue;
      // Styles named on the command line: only the pairs with one of them.
      if (ONLY.length > 0 && !ONLY.includes(above) && !ONLY.includes(below)) continue;
      const url = new URL(sceneUrl({ ...oval, above, board: below }));
      if (SUPPORTER) url.searchParams.set('supporter', '1');
      jobs.push({
        file: `oval-${above}-over-${below}-${WIDTH}x${HEIGHT}.png`,
        url: String(url),
        label: `${above} over ${below}`,
      });
    }
  }
} else {
  for (const d of DESIGNS) {
    if (ONLY.length > 0 && !ONLY.includes(d.name)) continue;
    jobs.push({ file: `${d.name}-${WIDTH}x${HEIGHT}.png`, url: sceneUrl(d), label: d.note });
  }
}

// A design asked for by name is made again; the whole set resumes where it stopped.
const missing = jobs.filter((j) => !ALL_SPLITS || !existsSync(join(OUT, j.file)));
const todo = missing.slice(0, LIMIT);
console.log(
  `${jobs.length - missing.length} already made, ${missing.length} to make, ${todo.length} now`,
);
const started = Date.now();
let done = 0;

/** Renders the jobs with `PARALLEL` pages at once, and returns those that failed. */
async function run(queue: Job[]): Promise<Job[]> {
  const failed: Job[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < queue.length) {
        const job = queue[next++]!;
        try {
          await shoot(browser, job);
          done++;
          const each = (Date.now() - started) / done;
          const left = Math.round((each * (todo.length - done)) / 60_000);
          console.log(`${done}/${todo.length} ${job.file} (about ${left} min left)`);
        } catch (e) {
          console.error(`  ${job.file} failed: ${(e as Error).message.split('\n')[0]}`);
          failed.push(job);
        }
      }
    }),
  );
  return failed;
}

let failed = await run(todo);
if (failed.length > 0) {
  console.log(`\nTrying the ${failed.length} that failed again`);
  failed = await run(failed);
}
await browser.close();

// The contact sheet: small and lazily loaded, since a thousand full pictures would not open.
const made = jobs.filter((j) => existsSync(join(OUT, j.file)));
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Bollfort wallpapers</title><style>
  body{font:14px system-ui,sans-serif;background:#000;color:#e8e8ea;margin:24px}
  .row{display:flex;flex-wrap:wrap;gap:24px}figure{margin:0}
  img{width:${ALL_SPLITS ? 320 : 620}px;aspect-ratio:${WIDTH}/${HEIGHT};display:block;outline:1px solid #222}
  figcaption{color:#9aa0ab;margin-top:4px}
  </style><h1>Bollfort — wallpapers, ${WIDTH} × ${HEIGHT}</h1><div class="row">${made
    .map(
      (j) =>
        `<figure><a href="${j.file}"><img loading="lazy" src="${j.file}"></a><figcaption>${j.label}</figcaption></figure>`,
    )
    .join('')}</div>`,
);
console.log(`\n${made.length} wallpapers and index.html in ${OUT}`);
if (failed.length > 0) {
  console.error(`${failed.length} failed; start the run again to retry them:`);
  for (const j of failed) console.error(`  ${j.file}`);
  process.exit(1);
}
