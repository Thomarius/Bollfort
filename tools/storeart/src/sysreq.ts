/**
 * The system requirements measured (STORE_PAGE.md §4.3): the packaged desktop app, its game
 * window playing an eight-player match of bots — every island drawn, every bot planning in the
 * page's worker — while every process of the app is sampled for memory and processor time, and
 * the page's frames are timed. Windows (the unpacked .exe, its processes read through
 * PowerShell) and Linux (the AppImage, its processes read from /proc).
 *
 *   npm run package -w @bollfort/desktop        # the app to measure, into release/
 *   npx tsx tools/storeart/src/sysreq.ts <name> [--fullscreen] [--affinity 0x5] [--round 8]
 *     [--seconds 240]
 *
 * `--affinity` limits every process of the app to the logical processors in the mask once the
 * match runs (0x5: two, on two physical cores), to see a weaker processor through this one. The
 * results go to the console and to `sysreq-<name>.json` in the current directory.
 *
 * Memory is not the same measure on both. Windows gives each process's private bytes and its
 * working set. On Linux the processes' resident sets overlap — Electron's processes share its
 * libraries — so their sum overstates the app; there `privateMB` is the pages no other process
 * maps (USS, Private_Clean + Private_Dirty), `pssMB` the shared pages divided between their users
 * (the honest total), and `workingSetMB` the plain sum of RSS, for reference. Integrated graphics
 * keep their buffers in system memory that may show in no process's figures.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, readlinkSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
const LINUX = process.platform === 'linux';
const RELEASE = resolve('packages/desktop/release');
const PORT = 9222;

/** The newest AppImage in release/, by its time: a stale one from an old version may lie beside it. */
function appImage(): string {
  const found = readdirSync(RELEASE)
    .filter((f) => f.endsWith('-linux.AppImage'))
    .map((f) => join(RELEASE, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (found[0] === undefined) throw new Error(`no AppImage in ${RELEASE}`);
  return found[0];
}

const EXE = LINUX ? appImage() : join(RELEASE, 'win-unpacked/Bollfort.exe');

interface Proc {
  id: number;
  cpu: number;
  ws: number;
  priv: number;
  /** Linux only: the proportional set size. */
  pss: number;
}

/** Every process of the app: its processor seconds so far and its memory, in bytes. */
function processes(): Proc[] {
  return LINUX ? linuxProcesses() : windowsProcesses();
}

function windowsProcesses(): Proc[] {
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
      return { id: id ?? 0, cpu: cpu ?? 0, ws: ws ?? 0, priv: priv ?? 0, pss: 0 };
    });
}

const CLOCK_TICKS = LINUX
  ? Number(spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).stdout)
  : 0;

/** A process's parent and processor ticks, from /proc/<pid>/stat; its name may hold spaces. */
function procStat(pid: number): { ppid: number; ticks: number } | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // After the name's closing parenthesis: state, ppid, … utime is the 14th field, stime the 15th.
    const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return { ppid: Number(f[1]), ticks: Number(f[11]) + Number(f[12]) };
  } catch {
    return undefined;
  }
}

/**
 * The AppImage's processes: its runtime (which mounts the image and starts Electron) and every
 * descendant, together with anything running from the image's mount — a helper that daemonised
 * and was reparented away from the tree. Not by name: the renderers and helpers are called many
 * things, and other programs are called Bollfort's too.
 */
function linuxPids(): number[] {
  const root = app.pid;
  const parent = new Map<number, number>();
  const fromMount = new Set<number>();
  for (const e of readdirSync('/proc')) {
    const pid = Number(e);
    if (!Number.isInteger(pid)) continue;
    const st = procStat(pid);
    if (st === undefined) continue;
    parent.set(pid, st.ppid);
    try {
      if (readlinkSync(`/proc/${pid}/exe`).includes('/.mount_Bollfo')) fromMount.add(pid);
    } catch {
      // Gone, or not ours to read.
    }
  }
  const ours = (pid: number): boolean => {
    for (let p = pid, hops = 0; p > 1 && hops < 64; p = parent.get(p) ?? 0, hops++) {
      if (p === root) return true;
    }
    return false;
  };
  const pids = [...parent.keys()].filter((pid) => ours(pid) || fromMount.has(pid));
  return pids;
}

function linuxProcesses(): Proc[] {
  const out: Proc[] = [];
  for (const id of linuxPids()) {
    const st = procStat(id);
    let rollup: string;
    try {
      rollup = readFileSync(`/proc/${id}/smaps_rollup`, 'utf8');
    } catch {
      continue;
    }
    if (st === undefined) continue;
    const kb = (key: string): number =>
      Number(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(rollup)?.[1] ?? 0) * 1024;
    out.push({
      id,
      cpu: st.ticks / CLOCK_TICKS,
      ws: kb('Rss'),
      priv: kb('Private_Clean') + kb('Private_Dirty'),
      pss: kb('Pss'),
    });
  }
  return out;
}

/**
 * The game window moved onto the primary display: the window manager may open it on another
 * (here a portrait monitor beside the main one), and full screen fills whichever display holds
 * it. Found among the app's windows by its title, the display by xrandr's `primary`.
 */
function toPrimaryDisplay(title: string): void {
  const primary = / connected primary (\d+)x(\d+)\+(\d+)\+(\d+)/.exec(
    spawnSync('xrandr', ['--query'], { encoding: 'utf8' }).stdout,
  );
  if (primary === null) throw new Error('xrandr names no primary display');
  const pids = new Set(linuxPids());
  // wmctrl -lp: the window's id, desktop, pid, host, then its title.
  const window = spawnSync('wmctrl', ['-lp'], { encoding: 'utf8' })
    .stdout.split('\n')
    .map((l) => l.trim().split(/\s+/))
    .find((f) => pids.has(Number(f[2])) && f.slice(4).join(' ') === title);
  if (window === undefined) throw new Error(`no window of the app titled ${title}`);
  const [, , , x, y] = primary.map(Number);
  spawnSync('wmctrl', ['-i', '-r', window[0]!, '-e', `0,${x! + 100},${y! + 100},-1,-1`]);
}

function setAffinity(mask: string): void {
  if (LINUX) {
    // Every thread of every process (-a); children started later inherit their parent's.
    for (const pid of linuxPids()) spawnSync('taskset', ['-a', '-p', mask, String(pid)]);
    return;
  }
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

/**
 * The graphics the page draws with, as WebGL names them: proof the card did the drawing and not
 * Chromium's software fallback (SwiftShader, llvmpipe), which a blocklisted driver gets silently.
 */
async function renderer(page: Page): Promise<string> {
  return page.evaluate(`(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'no WebGL 2';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  })()`);
}

const logical = LINUX
  ? Number(spawnSync('nproc', { encoding: 'utf8' }).stdout.trim())
  : Number(
      spawnSync('powershell', ['-NoProfile', '-Command', '[Environment]::ProcessorCount'], {
        encoding: 'utf8',
      }).stdout.trim(),
    );

// On Linux in a process group of its own, so that the teardown can end the whole app at once.
const app = spawn(EXE, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore', detached: LINUX });
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
  if (LINUX) {
    toPrimaryDisplay(await game.title());
    await new Promise((r) => setTimeout(r, 1000));
  }
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
    screen: `${screen.width} × ${screen.height}`,
  }));
  const gpu = await renderer(game);
  console.log(`${name}: ${size.w} × ${size.h} on ${size.screen}, ${gpu}, measuring ${SECONDS} s`);
  // What was measured, to look at: the table should be eight islands in play.
  await game.screenshot({ path: `sysreq-${name}.png` });

  await takeFrames(game);
  const samples: {
    t: number;
    cores: number;
    ws: number;
    priv: number;
    pss: number;
    n: number;
  }[] = [];
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
      pss: now.reduce((s, p) => s + p.pss, 0),
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
    platform: process.platform,
    app: EXE,
    renderer: gpu,
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
    ...(LINUX
      ? {
          pssMB: {
            avg: mb(avg(samples.map((s) => s.pss))),
            peak: mb(Math.max(...samples.map((s) => s.pss))),
          },
        }
      : {}),
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
  if (LINUX) {
    const signal = (sig: NodeJS.Signals): void => {
      try {
        process.kill(-app.pid!, sig);
      } catch {
        // The group is gone.
      }
      // Asked afresh, not every pid seen in the run: one of those may be another program's now.
      for (const pid of linuxPids()) {
        try {
          process.kill(pid, sig);
        } catch {
          // Gone.
        }
      }
    };
    signal('SIGTERM');
    await new Promise((r) => setTimeout(r, 3000));
    signal('SIGKILL');
  } else {
    app.kill();
  }
  if (!LINUX)
    spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      'Get-Process -Name Bollfort -ErrorAction SilentlyContinue | Stop-Process -Force',
    ]);
}
