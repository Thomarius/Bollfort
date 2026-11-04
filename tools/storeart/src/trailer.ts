/**
 * Steam's trailer (STEAM.md §9.2): clips of the game recorded live, cut to the music, captioned,
 * and encoded to Valve's settings. The plan was made with the user (2026-11-04).
 *
 *   npm run dev -w @bollfort/client                  # in another terminal
 *   npm run trailer -w @bollfort/storeart -- calibrate  # two seconds, to check the framing
 *   npm run trailer -w @bollfort/storeart -- record [clip…]
 *   npm run trailer -w @bollfort/storeart -- captions
 *   npm run trailer -w @bollfort/storeart -- assemble
 *
 * Recording opens a browser window on the screen and films it with ffmpeg's x11grab at 60 frames
 * a second — Playwright's own recorder is too soft for Steam — so the window must stay uncovered
 * while it runs. Each clip is a match started from the address with the person's seat on the
 * autopilot, waiting for its moment (a change of look, a tower's effect, a piece at rest) and
 * noting when it came, so the cut can be placed on it. `TRAILER_OUT` is where everything goes.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium, type Page } from 'playwright';

const BASE = process.env['BASE'] ?? 'http://localhost:5173';
const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const OUT = resolve(process.env['TRAILER_OUT'] ?? join(ROOT, 'trailer-build'));
const MUSIC = join(ROOT, 'assets', 'trailer', 'BollfortTrailer.mp3');
const DISPLAY = process.env['DISPLAY'] ?? ':0';
/** Where the window opens: on the primary screen, wherever that is. */
const WINDOW_AT = process.env['TRAILER_WINDOW'] ?? '1400,520';
const FPS = 60;
const W = 1920;
const H = 1080;

// --- The clips -----------------------------------------------------------------------------

/** What a clip waits for before its moment: the board up, or something in the match. */
type Moment =
  | { kind: 'ready' }
  | { kind: 'wipe' }
  | { kind: 'effect'; effect: 'lightning' | 'laser' | 'wave' | 'biggest' }
  | { kind: 'resting'; move: string };

interface Clip {
  name: string;
  params: Record<string, string>;
  moment: Moment;
  /** Seconds kept before the moment and after it; a `ready` clip's moment is its first frame. */
  before: number;
  after: number;
  /** A page other than a match (the tournament's), its address in full. */
  url?: string;
}

const MEDIEVAL_TO_CYBERPUNK = { buildStyle: 'pixel', combatStyle: 'cyberpunk' };
const TOWERS = { players: '2', snapshot: 'cannon_place', round: '4', specials: '1' };

const CLIPS: Clip[] = [
  // The hook: Ready… Aim… and "Fire!" carried by a change of look, the barrage after.
  {
    name: 'hook-wipe',
    params: { players: '4', snapshot: 'cannon_place', round: '2', ...MEDIEVAL_TO_CYBERPUNK },
    moment: { kind: 'wipe' },
    before: 3.2,
    after: 5,
  },
  // The loop.
  {
    name: 'loop-fire',
    params: {
      players: '2',
      snapshot: 'combat',
      round: '5',
      style: 'pixel',
      cameraFrom: '1',
      cameraZoom: '1.55',
      cameraOn: 'duel',
      cameraMs: '4500',
    },
    moment: { kind: 'ready' },
    before: 0,
    after: 5,
  },
  {
    name: 'loop-build',
    params: {
      players: '2',
      snapshot: 'build',
      round: '5',
      style: 'pixel',
      cameraZoom: '1.7',
      cameraOn: 'you',
    },
    moment: { kind: 'ready' },
    before: 0,
    after: 6,
  },
  // The styles, cut on the beat.
  {
    name: 'style-anime',
    params: {
      players: '4',
      snapshot: 'build',
      round: '4',
      style: 'anime',
      cameraZoom: '1.7',
      cameraOn: 'you',
    },
    moment: { kind: 'ready' },
    before: 0,
    after: 3,
  },
  {
    name: 'style-pirates',
    params: { players: '2', snapshot: 'combat', round: '4', style: 'pirates' },
    moment: { kind: 'ready' },
    before: 0,
    after: 3,
  },
  {
    name: 'style-wipe-sakura',
    params: {
      players: '3',
      snapshot: 'combat',
      round: '2',
      buildStyle: 'sakura',
      combatStyle: 'opera',
    },
    moment: { kind: 'wipe' },
    before: 0.8,
    after: 2.2,
  },
  {
    name: 'style-noir',
    params: { players: '2', snapshot: 'combat', round: '4', style: 'noir' },
    moment: { kind: 'ready' },
    before: 0,
    after: 3,
  },
  {
    name: 'style-christmas',
    params: {
      players: '4',
      snapshot: 'cannon_place',
      round: '4',
      style: 'christmas',
      cameraZoom: '1.8',
      cameraOn: 'you',
    },
    moment: { kind: 'ready' },
    before: 0,
    after: 3,
  },
  {
    name: 'style-mythos',
    params: { players: '3', snapshot: 'combat', round: '3', style: 'mythology' },
    moment: { kind: 'ready' },
    before: 0,
    after: 3,
  },
  {
    name: 'style-wildwest',
    params: {
      players: '6',
      snapshot: 'build',
      round: '4',
      style: 'wildwest',
      cameraZoom: '1.4',
      cameraOn: 'you',
    },
    moment: { kind: 'ready' },
    before: 0,
    after: 3,
  },
  // Scale and spectacle.
  {
    name: 'eight-pullout',
    params: {
      players: '8',
      snapshot: 'combat',
      round: '6',
      style: 'oktoberfest',
      cameraFrom: '2',
      cameraZoom: '1',
      cameraOn: 'you',
      cameraMs: '3200',
    },
    moment: { kind: 'ready' },
    before: 0,
    after: 4,
  },
  {
    name: 'teams-glass',
    params: { players: '8', teams: '2', snapshot: 'combat', round: '3', style: 'glass' },
    moment: { kind: 'ready' },
    before: 0,
    after: 3,
  },
  {
    name: 'tower-lightning',
    params: { ...TOWERS, style: 'cyberpunk', tower: 'lightning2' },
    moment: { kind: 'effect', effect: 'lightning' },
    before: 0.5,
    after: 1.5,
  },
  {
    name: 'tower-subwoofer',
    params: { ...TOWERS, style: 'anime', tower: 'subwoofer2' },
    moment: { kind: 'effect', effect: 'wave' },
    before: 0.3,
    after: 1.7,
  },
  {
    name: 'tower-laser',
    params: { ...TOWERS, style: 'electric', tower: 'laser2' },
    moment: { kind: 'effect', effect: 'laser' },
    before: 0.5,
    after: 1.5,
  },
  {
    name: 'tower-bertha',
    params: { ...TOWERS, style: 'halloween', tower: 'biggest2' },
    moment: { kind: 'effect', effect: 'biggest' },
    before: 1.2,
    after: 1.3,
  },
  {
    name: 'tournament',
    params: {},
    url: `${BASE}/?tournament=demo&seed=5&name=Ada&lang=en&clean=1`,
    moment: { kind: 'ready' },
    before: 0,
    after: 3.5,
  },
  // The peak: a big late duel, a last change of look.
  {
    name: 'peak-wipe',
    params: { players: '2', snapshot: 'cannon_place', round: '8', ...MEDIEVAL_TO_CYBERPUNK },
    moment: { kind: 'wipe' },
    before: 1.2,
    after: 3.8,
  },
  // The end: the title over the Cyberpunk split, as on the capsules, the board alive behind it.
  {
    name: 'endcard',
    params: {},
    url: `${BASE}/?${new URLSearchParams({
      storeArt: 'scene',
      autostart: '1',
      watch: '1',
      players: '2',
      level: '8',
      seed: '7',
      snapshot: 'combat',
      round: '3',
      combatStyle: 'pixel',
      buildStyle: 'cyberpunk',
      titleStyle: 'flat',
      title: 'center',
      titleWidth: '0.6',
      shade: '1',
      split: '0.5',
      lang: 'en',
    })}`,
    moment: { kind: 'ready' },
    before: 0,
    after: 9,
  },
];

// --- The cut -------------------------------------------------------------------------------

/**
 * The trailer, second by second against the music (STEAM.md: it steps up at about 14.5 and
 * 28.5 seconds, peaks from 43 and fades from 47.3; it ends at 51.1, and the title is held four
 * seconds more in silence). Each shot takes `length` seconds of a clip from `from` seconds after
 * its moment (negative: before it).
 */
interface Shot {
  clip: string;
  from: number;
  length: number;
}

const CUT: Shot[] = [
  { clip: 'hook-wipe', from: -2.6, length: 6.0 }, // 0.0 – 6.0: Ready… Aim… Fire!
  { clip: 'loop-fire', from: 0.3, length: 4.2 }, // 6.0 – 10.2
  { clip: 'loop-build', from: 0.5, length: 4.3 }, // 10.2 – 14.5
  { clip: 'style-anime', from: 0.2, length: 2.0 }, // 14.5 – 16.5: the first lift
  { clip: 'style-pirates', from: 0.2, length: 2.0 },
  { clip: 'style-wipe-sakura', from: -0.6, length: 2.0 },
  { clip: 'style-noir', from: 0.2, length: 2.0 },
  { clip: 'style-christmas', from: 0.2, length: 2.0 },
  { clip: 'style-mythos', from: 0.2, length: 2.0 },
  { clip: 'style-wildwest', from: 0.2, length: 2.0 }, // – 28.5
  { clip: 'eight-pullout', from: 0.0, length: 3.2 }, // 28.5 – 31.7: the second lift
  { clip: 'teams-glass', from: 0.2, length: 2.4 }, // – 34.1
  { clip: 'tower-lightning', from: -0.4, length: 1.6 }, // – 35.7
  { clip: 'tower-subwoofer', from: -0.2, length: 1.6 }, // – 37.3
  { clip: 'tower-laser', from: -0.4, length: 1.6 }, // – 38.9
  { clip: 'tower-bertha', from: -1.0, length: 1.8 }, // – 40.7
  { clip: 'tournament', from: 0.3, length: 2.3 }, // – 43.0
  { clip: 'peak-wipe', from: -1.0, length: 4.3 }, // 43.0 – 47.3: the peak
  { clip: 'endcard', from: 0.5, length: 7.7 }, // 47.3 – 55.0: the title, then silence
];

/** The captions and when they stand, in the trailer's seconds. */
interface Caption {
  text: string;
  start: number;
  end: number;
  /** `call`: big in the middle, as the game calls a phase; `lower`: a band low on the screen. */
  look: 'call' | 'lower' | 'end';
}

const CAPTIONS: Caption[] = [
  { text: 'Ready…', start: 0.3, end: 1.4, look: 'call' },
  { text: 'Aim…', start: 1.5, end: 2.6, look: 'call' },
  { text: 'Fire at their walls.', start: 6.3, end: 9.8, look: 'lower' },
  { text: 'Rebuild yours.', start: 10.4, end: 12.3, look: 'lower' },
  { text: 'Seal your castles.', start: 12.4, end: 14.3, look: 'lower' },
  { text: '24 styles', start: 14.7, end: 18.3, look: 'lower' },
  { text: 'Up to 8 players', start: 28.7, end: 31.5, look: 'lower' },
  { text: 'Online multiplayer and bots', start: 31.7, end: 34.0, look: 'lower' },
  { text: 'Special towers', start: 34.2, end: 40.5, look: 'lower' },
  { text: 'Tournaments', start: 40.8, end: 42.9, look: 'lower' },
  { text: 'Free on Steam', start: 51.0, end: 55.0, look: 'end' },
];

const LENGTH = CUT.reduce((sum, s) => sum + s.length, 0);

// --- Recording -----------------------------------------------------------------------------

function clipUrl(clip: Clip): string {
  if (clip.url !== undefined) return clip.url;
  const q = new URLSearchParams({
    autostart: '1',
    autopilot: '1',
    clean: '1',
    level: '7',
    seed: '7',
    lang: 'en',
    ...clip.params,
  });
  return `${BASE}/?${q}`;
}

/** Waits for a clip's moment in the page. */
async function waitFor(page: Page, moment: Moment): Promise<void> {
  if (moment.kind === 'wipe') {
    await page.waitForSelector('.phase-call', { timeout: 150_000 });
  } else if (moment.kind === 'effect') {
    const before = await page.evaluate(() =>
      Number(document.documentElement.dataset['effects'] ?? 0),
    );
    await page.waitForFunction(
      ([k, n]) =>
        document.documentElement.dataset['effect'] === k &&
        Number(document.documentElement.dataset['effects'] ?? 0) > (n as number),
      [moment.effect, before] as const,
      { timeout: 150_000, polling: 8 },
    );
  } else if (moment.kind === 'resting') {
    await page.waitForFunction(
      (k) => document.documentElement.dataset['autopilot'] === `resting:${k}`,
      moment.move,
      { timeout: 150_000, polling: 8 },
    );
  }
}

/** ffmpeg filming the page's area of the screen, lossless enough to cut and grade later. */
function film(rect: { x: number; y: number }, file: string): ChildProcess {
  return spawn(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'x11grab',
      '-draw_mouse',
      '0',
      '-framerate',
      String(FPS),
      '-video_size',
      `${W}x${H}`,
      '-i',
      `${DISPLAY}+${rect.x},${rect.y}`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '10',
      '-pix_fmt',
      'yuv444p',
      file,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
}

async function stop(ffmpeg: ChildProcess): Promise<void> {
  await new Promise<void>((done) => {
    ffmpeg.on('exit', () => done());
    ffmpeg.stdin?.write('q');
  });
}

async function record(names: string[], calibrate: boolean): Promise<void> {
  mkdirSync(join(OUT, 'clips'), { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--enable-gpu',
      '--use-angle=gl',
      '--ignore-gpu-blocklist',
      '--mute-audio',
      `--window-position=${WINDOW_AT}`,
      '--force-device-scale-factor=1',
    ],
  });
  const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
  page.on('pageerror', (e) => console.error(`  page error: ${e.message}`));
  await page.goto(`${BASE}/?lang=en`);
  await page.waitForTimeout(1500);
  // The page's place on the screen: the window's, less its frame and the browser's bar above.
  const rect = await page.evaluate(() => {
    const side = (outerWidth - innerWidth) / 2;
    return {
      x: Math.round(screenX + side),
      y: Math.round(screenY + outerHeight - innerHeight - side),
    };
  });
  console.log(`filming the screen at ${rect.x},${rect.y}`);

  if (calibrate) {
    const file = join(OUT, 'calibrate.mkv');
    const ffmpeg = film(rect, file);
    await page.waitForTimeout(2000);
    await stop(ffmpeg);
    spawnSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-sseof',
      '-0.5',
      '-i',
      file,
      '-frames:v',
      '1',
      join(OUT, 'calibrate.png'),
    ]);
    console.log(
      `a frame of it: ${join(OUT, 'calibrate.png')} — the menu must fill it, edge to edge`,
    );
    await browser.close();
    return;
  }

  const times: Record<string, { moment: number }> = existsSync(join(OUT, 'clips', 'moments.json'))
    ? JSON.parse(readFileSync(join(OUT, 'clips', 'moments.json'), 'utf8'))
    : {};
  for (const clip of CLIPS) {
    if (names.length > 0 && !names.includes(clip.name)) continue;
    console.log(clip.name);
    await page.goto(clipUrl(clip));
    // The fast-forward done and the look drawn: the board up, a moment to settle.
    await page.waitForSelector('#stage', { timeout: 120_000 });
    await page.waitForTimeout(2500);
    const file = join(OUT, 'clips', `${clip.name}.mkv`);
    const ffmpeg = film(rect, file);
    const startedAt = Date.now();
    await page.waitForTimeout(300);
    if (clip.moment.kind === 'ready') {
      // The camera's move starts with the film.
      await page.evaluate(() => {
        document.documentElement.dataset['cameraGo'] = String(performance.now());
      });
    } else {
      await page.waitForTimeout(clip.before * 1000);
      await waitFor(page, clip.moment).catch((e: Error) =>
        console.error(`  never came: ${e.message.split('\n')[0]}`),
      );
    }
    const moment = clip.moment.kind === 'ready' ? 0.3 : (Date.now() - startedAt) / 1000;
    await page.waitForTimeout(clip.after * 1000 + 200);
    await stop(ffmpeg);
    times[clip.name] = { moment };
    writeFileSync(join(OUT, 'clips', 'moments.json'), JSON.stringify(times, null, 2));
    console.log(`  its moment ${moment.toFixed(2)} s in`);
  }
  await browser.close();
}

// --- Captions ------------------------------------------------------------------------------

/** Each caption drawn once as a transparent picture the size of the frame, in the game's fonts. */
async function captions(): Promise<void> {
  mkdirSync(join(OUT, 'captions'), { recursive: true });
  // Embedded: a page set from a string may not load a font from a file.
  const rubik = readFileSync(
    join(
      ROOT,
      'node_modules',
      '@fontsource-variable',
      'rubik',
      'files',
      'rubik-latin-wght-normal.woff2',
    ),
  ).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const [i, c] of CAPTIONS.entries()) {
    const style =
      c.look === 'call'
        ? `top:50%;left:0;right:0;transform:translateY(-50%);text-align:center;font-size:150px;letter-spacing:0.08em;`
        : c.look === 'end'
          ? `bottom:150px;left:0;right:0;text-align:center;font-size:64px;letter-spacing:0.06em;`
          : `bottom:110px;left:0;right:0;text-align:center;font-size:72px;`;
    const band =
      c.look === 'lower'
        ? `.band{position:absolute;left:0;right:0;bottom:80px;height:150px;background:rgb(11 13 19/72%);border-block:3px solid #d8b84a}`
        : '.band{display:none}';
    await page.setContent(`<!doctype html><style>
@font-face{font-family:Rubik;src:url(data:font/woff2;base64,${rubik}) format('woff2');font-weight:300 900}
html,body{margin:0;background:transparent;width:${W}px;height:${H}px;overflow:hidden}
${band}
.text{position:absolute;${style}font-family:Rubik;font-weight:800;color:#fff;
text-shadow:0 0 3px #000,0 0 3px #000,0 0 8px rgb(0 0 0/80%),0 6px 18px rgb(0 0 0/70%)}
</style><div class="band"></div><div class="text">${c.text}</div>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(OUT, 'captions', `${i}.png`), omitBackground: true });
  }
  await browser.close();
  console.log(`${CAPTIONS.length} captions in ${join(OUT, 'captions')}`);
}

// --- Assembly ------------------------------------------------------------------------------

/** The cut, captioned, with the music, encoded as Valve asks: H.264 and AAC, 1080p at 60. */
function assemble(): void {
  const moments: Record<string, { moment: number }> = JSON.parse(
    readFileSync(join(OUT, 'clips', 'moments.json'), 'utf8'),
  );
  const inputs: string[] = [];
  const filters: string[] = [];
  CUT.forEach((shot, i) => {
    const at = moments[shot.clip]?.moment;
    if (at === undefined) throw new Error(`no recording of ${shot.clip}`);
    inputs.push('-i', join(OUT, 'clips', `${shot.clip}.mkv`));
    const start = Math.max(0, at + shot.from);
    filters.push(
      `[${i}:v]trim=start=${start.toFixed(3)}:duration=${shot.length.toFixed(3)},setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p[s${i}]`,
    );
  });
  filters.push(`${CUT.map((_, i) => `[s${i}]`).join('')}concat=n=${CUT.length}:v=1:a=0[cut]`);
  let last = 'cut';
  CAPTIONS.forEach((c, i) => {
    const n = CUT.length + i;
    inputs.push('-loop', '1', '-t', String(LENGTH), '-i', join(OUT, 'captions', `${i}.png`));
    const fade = 0.25;
    filters.push(
      `[${n}:v]format=rgba,fade=t=in:st=${c.start}:d=${fade}:alpha=1,fade=t=out:st=${(c.end - fade).toFixed(2)}:d=${fade}:alpha=1[c${i}]`,
      `[${last}][c${i}]overlay=enable='between(t,${c.start},${c.end})'[v${i}]`,
    );
    last = `v${i}`;
  });
  // A short fade from black at the start, and to black at the very end.
  filters.push(
    `[${last}]fade=t=in:st=0:d=0.3,fade=t=out:st=${(LENGTH - 0.6).toFixed(2)}:d=0.6[video]`,
  );
  const music = CUT.length + CAPTIONS.length;
  inputs.push('-i', MUSIC);
  filters.push(`[${music}:a]apad,atrim=duration=${LENGTH},aresample=48000[audio]`);
  const file = join(OUT, 'BollfortTrailer.mp4');
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      ...inputs,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[video]',
      '-map',
      '[audio]',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '16',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(FPS),
      '-c:a',
      'aac',
      '-b:a',
      '256k',
      '-movflags',
      '+faststart',
      '-t',
      String(LENGTH),
      file,
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error('ffmpeg failed');
  console.log(`${file}, ${LENGTH.toFixed(1)} s`);
}

const [command = 'help', ...rest] = process.argv.slice(2);
if (command === 'calibrate') await record([], true);
else if (command === 'record') await record(rest, false);
else if (command === 'captions') await captions();
else if (command === 'assemble') assemble();
else
  console.log(
    'npm run trailer -w @bollfort/storeart -- calibrate | record [clip…] | captions | assemble',
  );
