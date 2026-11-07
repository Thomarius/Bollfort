/**
 * The system requirements measured (STORE_PAGE.md §4.3): the packaged desktop app, its game
 * window playing an eight-player match of bots — every island drawn, every bot planning in the
 * page's worker — while every process of the app is sampled for memory and processor time, and
 * the page's frames are timed. Windows only (it reads the processes through PowerShell).
 *
 *   npm run package -w @bollfort/desktop        # the app to measure, into release/win-unpacked
 *   npx tsx tools/storeart/src/sysreq.ts <name> [--fullscreen] [--affinity 0x5] [--round 8]
 *     [--seconds 240]
 *
 * `--affinity` limits every process of the app to the logical processors in the mask once the
 * match runs (0x5: two, on two physical cores), to see a weaker processor through this one. The
 * results go to the console and to `sysreq-<name>.json` in the current directory.
 */
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium, type Page } from 'playwright';

const args = process.argv.slice(2);
const name = args[0] ?? 'run';
const flag = (f: string): string | undefined => {
  const i = args.indexOf(f);
  return i < 0 ? undefined : args[i + 1];
};
const FULLSCREEN = args.includes('--fullscreen');
const AFFINITY = flag('--affinity');
const SECONDS = Number(flag('--seconds') ?? 240);
/** From a round deep in the match (`--round 8`): more wall, more guns, more shells than round 1. */
const ROUND = flag('--round');
const WARMUP_MS = 20_000;
const SAMPLE_MS = 2_000;
const EXE = resolve('packages/desktop/release/win-unpacked/Bollfort.exe');
const PORT = 9222;

interface Proc {
  id: number;
  cpu: number;
  ws: number;
  priv: number;
}

/** Every process of the app: its processor seconds so far and its memory, in bytes. */
function processes(): Proc[] {
  const out = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      'Get-Process -Name Bollfort -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id) $($_.CPU) $($_.WorkingSet64) $($_.PrivateMemorySize64)" }',
    ],
    { encoding: 'utf8' },
  ).stdout;
  return out
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const [id, cpu, ws, priv] = l.trim().split(/\s+/).map(Number);
      return { id: id ?? 0, cpu: cpu ?? 0, ws: ws ?? 0, priv: priv ?? 0 };
    });
}

function setAffinity(mask: string): void {
  spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    `Get-Process -Name Bollfort | ForEach-Object { $_.ProcessorAffinity = ${mask} }`,
  ]);
}

/** Frame intervals kept by the page itself, read and cleared at each look. */
// As text: a function would be sent as tsx compiled it, with a `__name` helper the page lacks.
async function installFrameClock(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => {
      window.__frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
}

async function takeFrames(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[] };
    const f = w.__frames;
    w.__frames = [];
    return f;
  });
}

const logical = Number(
  spawnSync('powershell', ['-NoProfile', '-Command', '[Environment]::ProcessorCount'], {
    encoding: 'utf8',
  }).stdout.trim(),
);

const app = spawn(EXE, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore' });
let browser;
try {
  // The app's own devtools endpoint, once it answers.
  for (let i = 0; i < 60; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (browser === undefined) throw new Error('the app did not open its devtools port');
  const context = browser.contexts()[0]!;
  const control = context.pages().find((p) => p.url().includes('index.html'));
  if (control === undefined) throw new Error('no control window');
  await control.waitForSelector('#play:not([disabled])', { timeout: 30_000 });
  const opened = context.waitForEvent('page');
  await control.click('#play');
  const game = await opened;
  await game.waitForLoadState('load');
  const base = new URL(game.url());
  // Eight bots at the top level, a whole match, as the heaviest table a player can set.
  await game.goto(
    `${base.origin}/?autostart=1&watch=1&players=8&level=8&lang=en` +
      (ROUND === undefined ? '' : `&snapshot=combat&round=${ROUND}`),
  );
  await game.waitForSelector('#stage', { timeout: 60_000 });
  if (FULLSCREEN) {
    await game.waitForSelector('#fullscreen', { timeout: 30_000 });
    await game.click('#fullscreen');
  }
  await installFrameClock(game);
  console.log(`${name}: warming up ${WARMUP_MS / 1000} s`);
  await new Promise((r) => setTimeout(r, WARMUP_MS));
  if (AFFINITY !== undefined) setAffinity(AFFINITY);
  const size = await game.evaluate(() => ({
    w: innerWidth,
    h: innerHeight,
    dpr: devicePixelRatio,
  }));
  console.log(`${name}: ${size.w} × ${size.h}, measuring ${SECONDS} s`);
  // What was measured, to look at: the table should be eight islands in play.
  await game.screenshot({ path: `sysreq-${name}.png` });

  await takeFrames(game);
  const samples: { t: number; cores: number; ws: number; priv: number; n: number }[] = [];
  const frames: number[] = [];
  let before = processes();
  let t0 = Date.now();
  const end = t0 + SECONDS * 1000;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, SAMPLE_MS));
    const now = processes();
    const t1 = Date.now();
    const seconds = (t1 - t0) / 1000;
    let cpu = 0;
    for (const p of now) cpu += p.cpu - (before.find((b) => b.id === p.id)?.cpu ?? p.cpu);
    samples.push({
      t: t1,
      cores: cpu / seconds,
      ws: now.reduce((s, p) => s + p.ws, 0),
      priv: now.reduce((s, p) => s + p.priv, 0),
      n: now.length,
    });
    frames.push(...(await takeFrames(game)));
    before = now;
    t0 = t1;
  }

  const mb = (b: number): number => Math.round(b / 1048576);
  const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  const sorted = [...frames].sort((a, b) => a - b);
  const pct = (p: number): number => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
  const result = {
    name,
    fullscreen: FULLSCREEN,
    fromRound: ROUND === undefined ? 1 : Number(ROUND),
    affinity: AFFINITY ?? null,
    window: size,
    logicalProcessors: logical,
    seconds: SECONDS,
    processes: Math.max(...samples.map((s) => s.n)),
    privateMB: {
      avg: mb(avg(samples.map((s) => s.priv))),
      peak: mb(Math.max(...samples.map((s) => s.priv))),
    },
    workingSetMB: {
      avg: mb(avg(samples.map((s) => s.ws))),
      peak: mb(Math.max(...samples.map((s) => s.ws))),
    },
    coresBusy: {
      avg: +avg(samples.map((s) => s.cores)).toFixed(2),
      peak: +Math.max(...samples.map((s) => s.cores)).toFixed(2),
    },
    frames: {
      count: frames.length,
      fps: +(1000 / avg(frames)).toFixed(1),
      medianMs: +pct(0.5).toFixed(1),
      p95Ms: +pct(0.95).toFixed(1),
      p99Ms: +pct(0.99).toFixed(1),
      over25ms: +((frames.filter((f) => f > 25).length / frames.length) * 100).toFixed(2),
    },
  };
  console.log(JSON.stringify(result, null, 2));
  writeFileSync(`sysreq-${name}.json`, JSON.stringify({ ...result, samples }, null, 2));
} finally {
  await browser?.close().catch(() => undefined);
  app.kill();
  spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    'Get-Process -Name Bollfort -ErrorAction SilentlyContinue | Stop-Process -Force',
  ]);
}
