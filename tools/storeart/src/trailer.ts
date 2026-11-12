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
/**
 * The screen's shake as your walls are hit, as a share of its reach (`TRAILER_SHAKE`, 0 to 1):
 * versions without it (`0`, the user's wish, 2026-11-04) and at half (`0.5`, 2026-11-05), their
 * clips filmed with `&shake=`, each in a folder of its own; unset, the full shake.
 */
const SHAKE = ((): number => {
  const raw = process.env['TRAILER_SHAKE'];
  if (raw === undefined || raw === '') return 1;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(`TRAILER_SHAKE must be a number from 0 to 1, not "${raw}"`);
  return value;
})();
const SHAKE_FOLDER =
  SHAKE === 1 ? [] : [SHAKE === 0 ? 'still' : SHAKE === 0.5 ? 'half' : `shake-${SHAKE}`];
/**
 * The store page's loops (`TRAILER_SET=loops`, ARCHIVE 15zo): scenes of their own, not the
 * trailer's, filmed with no words on the screen but a phase banner's (`&labels=0`) — Valve asks
 * text in a picture to be translated — and those with a banner once in each language
 * (`TRAILER_LANG=de`), into `trailer-build/loops/<lang>/`.
 */
const SET = process.env['TRAILER_SET'] === 'loops' ? 'loops' : 'trailer';
const LANG = process.env['TRAILER_LANG'] === 'de' ? 'de' : 'en';
const OUT = resolve(
  process.env['TRAILER_OUT'] ??
    (SET === 'loops'
      ? join(ROOT, 'trailer-build', 'loops', LANG)
      : join(ROOT, 'trailer-build', ...SHAKE_FOLDER)),
);
/**
 * The last line, over the title in the silence (`TRAILER_END`): `steam`, the default, for the store
 * once the game is out; `soon` for the version shown while Steamworks is still being set up
 * (2026-11-12, the user's). The cut is the same, so a version is only its captions and its file,
 * `captions-<end>` and `BollfortTrailer-<end>.mp4`, beside the default's.
 */
const ENDINGS = { steam: 'Free on Steam', soon: 'Coming soon · Free on Steam' } as const;
const END = ((): keyof typeof ENDINGS => {
  const raw = process.env['TRAILER_END'];
  if (raw === undefined || raw === '') return 'steam';
  if (!(raw in ENDINGS))
    throw new Error(`TRAILER_END must be one of ${Object.keys(ENDINGS).join(', ')}, not "${raw}"`);
  return raw as keyof typeof ENDINGS;
})();
const END_SUFFIX = END === 'steam' ? '' : `-${END}`;
const CAPTIONS_DIR = `captions${END_SUFFIX}`;
const MUSIC = join(ROOT, 'assets', 'trailer', 'BollfortTrailer.mp3');
const DISPLAY = process.env['DISPLAY'] ?? ':0';
/**
 * Filmed on Windows too (the user's gaming PC, 2026-11-05): the screen grabbed by DirectX's
 * desktop duplication (ffmpeg's `ddagrab`, from the graphics card) and encoded by NVENC, the
 * card's own encoder — a dedicated card, not one sharing the processor's memory as this
 * machine's did. `TRAILER_CAPTURE=gdigrab` and `TRAILER_ENCODER=cpu` fall back to GDI and x264.
 * The window must stand on the primary monitor, whose top-left is the desktop's 0,0, at 100%
 * display scaling.
 */
const WINDOWS = process.platform === 'win32';
const WIN_CAPTURE = process.env['TRAILER_CAPTURE'] ?? 'ddagrab';
const WIN_ENCODER = process.env['TRAILER_ENCODER'] ?? 'nvenc';
/**
 * Full screen, for a monitor exactly 1920 × 1080, where a window with its frame cannot hold a
 * page of that size (`TRAILER_FULLSCREEN=1`): Chrome in kiosk mode, the page the whole screen.
 */
const FULLSCREEN = process.env['TRAILER_FULLSCREEN'] === '1';
/** Where the window opens: on the primary screen, wherever that is. */
const WINDOW_AT = process.env['TRAILER_WINDOW'] ?? (WINDOWS ? '40,40' : '1400,520');
const FPS = 60;
const W = 1920;
const H = 1080;

// --- The clips -----------------------------------------------------------------------------

/** What a clip waits for before its moment: the board up, or something in the match. */
type Moment =
  | { kind: 'ready' }
  | { kind: 'wipe' }
  | { kind: 'effect'; effect: 'lightning' | 'laser' | 'wave' | 'biggest' | 'sealed' }
  | { kind: 'resting'; move: string };

interface Clip {
  name: string;
  params: Record<string, string>;
  moment: Moment;
  /** Seconds kept before the moment and after it; a `ready` clip's moment is its first frame. */
  before: number;
  after: number;
  /** A page other than a match, its address in full. */
  url?: string;
  /** How long the board is left to settle before filming; 2.5 seconds unless said. */
  settleMs?: number;
  /**
   * Filmed slowed, the page's clock at this share of real time, and sped up again in the cut: a
   * heavy moment — a change of look, the camera pulling out over eight islands, fireworks — the
   * game renders too few frames of at full speed, and stutters (2026-11-04).
   */
  slow?: number;
  /** A phase banner in the picture, so filmed in each language (the loops). */
  banner?: boolean;
}

const MEDIEVAL_TO_CYBERPUNK = { buildStyle: 'pixel', combatStyle: 'cyberpunk' };
const TOWERS = { players: '2', snapshot: 'cannon_place', round: '4', specials: '1' };

const CLIPS: Clip[] = [
  // The hook: Ready… Aim… and "Fire!" carried by a change of look, the barrage after.
  {
    name: 'hook-wipe',
    params: { players: '4', snapshot: 'cannon_place', round: '2', ...MEDIEVAL_TO_CYBERPUNK },
    slow: 0.25,
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
  // A castle sealed, close: its ground filling and the castle coming alive — in Cartoon it starts
  // dancing, in Pirates the Jolly Roger goes up (the user's wish, 2026-11-05). Cartoon's is round 1,
  // the main castle's starting ring breached in the first combat and closed round its three sleeping
  // cannons — the game's core, not round 5's outlying castle with no room for a gun (the user's,
  // 2026-11-05); its seal comes some 6 seconds in.
  {
    name: 'seal-cartoon',
    params: {
      players: '2',
      snapshot: 'build',
      round: '1',
      style: 'cartoon',
      cameraZoom: '1.8',
      cameraOn: 'you',
    },
    slow: 0.5,
    moment: { kind: 'effect', effect: 'sealed' },
    before: 1.5,
    after: 3,
  },
  {
    name: 'seal-pirates',
    // Another match than Cartoon's — three players, seed 11, round 3 — so another island, castle
    // and moment: the same match in two looks would have been one scene twice (the user's).
    params: {
      players: '3',
      seed: '11',
      snapshot: 'build',
      round: '3',
      style: 'pirates',
      cameraZoom: '1.8',
      cameraOn: 'you',
    },
    slow: 0.5,
    moment: { kind: 'effect', effect: 'sealed' },
    before: 1.5,
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
    slow: 0.5,
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
    slow: 0.5,
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
    // Under "Tournaments": a team match's end, the camera pushing onto the winners and their
    // fireworks, the team names in the bar — the League window was menus and no action (the
    // user, 2026-11-04). Filmed from the board's first frame: the push begins with it, and the
    // summary slides over the board some four seconds in.
    name: 'tournament',
    params: { players: '6', teams: '2', snapshot: 'game_over', style: 'chocolate' },
    slow: 0.5,
    moment: { kind: 'ready' },
    before: 0,
    after: 3.6,
    settleMs: 0,
  },
  // A late duel turning Cyberpunk: kept, though its slow banner left it out of the montage.
  {
    name: 'peak-wipe',
    params: { players: '2', snapshot: 'cannon_place', round: '8', ...MEDIEVAL_TO_CYBERPUNK },
    slow: 0.25,
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
    // Half speed, filmed from early in combat: its 8.2 seconds in the cut then fit inside the ten
    // of one combat, and the shooting runs on through the fade (the user, 2026-11-04).
    slow: 0.5,
    settleMs: 1500,
    moment: { kind: 'ready' },
    before: 0,
    after: 9,
  },
];

// --- The cut -------------------------------------------------------------------------------

/**
 * The store page's loops (2026-11-06, the user's list): changes of look into combat under "Fire!"
 * and into building, cannons placed, a seal in Stadium and three more in Cartoon, building close
 * up, the Frost Cannon and the Lullaby Tower, the final round's climax, and barrages — none of
 * them a scene of the trailer. Filmed generously; the loops are cut from them by hand.
 */
const CLOSE = { cameraZoom: '1.8', cameraOn: 'you' };
const DUEL = { cameraZoom: '1.4', cameraOn: 'duel' };
const LOOP_CLIPS: Clip[] = [
  ...(
    [
      ['wipe-christmas-halloween', '2', '3', 'christmas', 'halloween'],
      ['wipe-bricks-glass', '3', '2', 'bricks', 'glass'],
    ] as const
  ).map(([name, players, round, buildStyle, combatStyle]) => ({
    name,
    params: { players, snapshot: 'cannon_place', round, buildStyle, combatStyle },
    slow: 0.5,
    moment: { kind: 'wipe' } as const,
    before: 1.2,
    after: 3.5,
    banner: true,
  })),
  ...(
    [
      ['wipe-undersea-oktoberfest', '2', '3', 'undersea', 'oktoberfest'],
      ['wipe-electric-chocolate', '3', '4', 'electric', 'chocolate'],
    ] as const
  ).map(([name, players, round, combatStyle, buildStyle]) => ({
    name,
    params: { players, snapshot: 'combat', round, buildStyle, combatStyle },
    slow: 0.5,
    moment: { kind: 'wipe' } as const,
    before: 1.2,
    after: 3.5,
    banner: true,
  })),
  {
    name: 'cannons-office',
    params: { players: '2', snapshot: 'cannon_place', round: '3', style: 'office', ...CLOSE },
    // Filmed at once: the bot places its guns in the phase's first seconds.
    settleMs: 300,
    moment: { kind: 'ready' },
    before: 0,
    after: 7,
  },
  {
    name: 'cannons-chocolate',
    params: { players: '2', snapshot: 'cannon_place', round: '2', style: 'chocolate', ...CLOSE },
    // Filmed at once: the bot places its guns in the phase's first seconds.
    settleMs: 300,
    moment: { kind: 'ready' },
    before: 0,
    after: 7,
  },
  {
    name: 'seal-sports',
    params: {
      players: '2',
      snapshot: 'build',
      round: '1',
      style: 'sports',
      cameraZoom: '1.3',
      cameraOn: 'you',
    },
    slow: 0.5,
    moment: { kind: 'effect', effect: 'sealed' },
    before: 2,
    after: 4,
  },
  ...(
    [
      ['seal-cartoon-b', '2', '3', '1'],
      ['seal-cartoon-c', '3', '11', '2'],
      ['seal-cartoon-d', '2', '2', '1'],
    ] as const
  ).map(([name, players, seed, round]) => ({
    name,
    params: { players, seed, snapshot: 'build', round, style: 'cartoon', ...CLOSE },
    slow: 0.5,
    moment: { kind: 'effect', effect: 'sealed' } as const,
    before: 2.7,
    after: 4,
  })),
  {
    name: 'build-undersea',
    params: { players: '2', snapshot: 'build', round: '3', style: 'undersea', ...CLOSE },
    moment: { kind: 'ready' },
    before: 0,
    after: 7,
  },
  {
    name: 'build-oktoberfest',
    params: {
      players: '2',
      seed: '11',
      snapshot: 'build',
      round: '4',
      style: 'oktoberfest',
      ...CLOSE,
    },
    moment: { kind: 'ready' },
    before: 0,
    after: 7,
  },
  // A tower bought in the cannon phase, then its combat: the frost on the tiles it hits, the
  // guns it lulls. The film runs from "Fire!" through the combat; the loop is cut after it.
  {
    name: 'tower-frost',
    params: { ...TOWERS, style: 'night', tower: 'frost3', ...DUEL },
    moment: { kind: 'wipe' },
    before: 0.5,
    after: 14,
  },
  {
    name: 'tower-lullaby',
    params: { ...TOWERS, style: 'pixel', tower: 'lullaby3', ...DUEL },
    moment: { kind: 'wipe' },
    before: 0.5,
    after: 14,
  },
  // The final round's combat, its climax: Night's blood moon, the Pirates' Kraken.
  {
    name: 'climax-night',
    params: { players: '2', rounds: '3', snapshot: 'combat', round: '3', style: 'night' },
    moment: { kind: 'ready' },
    before: 0,
    after: 10,
  },
  {
    name: 'climax-pirates',
    params: { players: '2', rounds: '3', snapshot: 'combat', round: '3', style: 'pirates' },
    moment: { kind: 'ready' },
    before: 0,
    after: 10,
  },
  {
    name: 'barrage-electric',
    params: { players: '2', snapshot: 'combat', round: '6', style: 'electric', ...DUEL },
    moment: { kind: 'ready' },
    before: 0,
    after: 7,
  },
  {
    name: 'barrage-undersea',
    params: {
      players: '2',
      seed: '11',
      snapshot: 'combat',
      round: '5',
      style: 'undersea',
      ...DUEL,
    },
    moment: { kind: 'ready' },
    before: 0,
    after: 7,
  },
  // Cartoon's combat close on the person's castle, its guns firing throughout and the castle
  // dancing, for a loop that runs almost seamlessly (the user's, 2026-11-06): four takes.
  ...(
    [
      ['combat-cartoon-a', '7', '2', '1.6', 'you'],
      ['combat-cartoon-b', '7', '3', '1.6', 'you'],
      ['combat-cartoon-c', '3', '3', '1.4', 'you'],
      ['combat-cartoon-d', '11', '2', '1.5', 'duel'],
    ] as const
  ).map(([name, seed, round, cameraZoom, cameraOn]) => ({
    name,
    params: {
      players: '2',
      seed,
      snapshot: 'combat',
      round,
      style: 'cartoon',
      cameraZoom,
      cameraOn,
      // No countdown: a count jumping back at the loop's seam would give it away.
      timer: '0',
    },
    moment: { kind: 'ready' } as const,
    before: 0,
    after: 9,
  })),
];

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
  // 1.5 s later than the first cut: the banner already in sight, the shooting in time with the
  // countdown (the user, 2026-11-04).
  { clip: 'hook-wipe', from: -1.1, length: 6.0 }, // 0.0 – 6.0: Ready… Aim… Fire!
  { clip: 'loop-fire', from: 0.3, length: 4.2 }, // 6.0 – 10.2
  // One shot for the rebuilding, under one caption: the ring closed piece by piece round its
  // sleeping guns, then sealed — 2.7 s before the seal, 1.6 after — in place of a Pixel building
  // shot and the seal, each two seconds and captioned apart, too short to follow (the user's,
  // 2026-11-05).
  { clip: 'seal-cartoon', from: -2.7, length: 4.3 }, // 10.2 – 14.5: Rebuild yours
  { clip: 'style-anime', from: 0.2, length: 2.0 }, // 14.5 – 16.5: the first lift
  { clip: 'seal-pirates', from: -0.6, length: 2.0 },
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
  // From 0.4 s: the screen that hides the board while it is drawn showed in the first frames.
  { clip: 'tournament', from: 0.4, length: 2.3 }, // – 43.0
  // The peak: half-second cuts of the most action in the recordings, then the title hard on the
  // climax at 46.8 — "chaotic scenes with a sudden switch", the user's (2026-11-04).
  { clip: 'style-pirates', from: 2.6, length: 0.55 },
  { clip: 'tower-bertha', from: -6.0, length: 0.55 },
  { clip: 'loop-fire', from: 4.3, length: 0.55 },
  { clip: 'teams-glass', from: 2.6, length: 0.55 },
  { clip: 'tower-lightning', from: 1.0, length: 0.5 },
  { clip: 'style-noir', from: 2.6, length: 0.5 },
  { clip: 'tower-bertha', from: 0.9, length: 0.6 }, // – 46.8
  { clip: 'endcard', from: 0.5, length: 8.2 }, // 46.8 – 55.0: the title, then silence
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
  { text: 'Fire at their walls', start: 6.3, end: 9.8, look: 'lower' },
  { text: 'Rebuild yours', start: 10.4, end: 14.3, look: 'lower' },
  { text: '24 styles', start: 14.7, end: 18.3, look: 'lower' },
  { text: 'Up to 8 players', start: 28.7, end: 31.5, look: 'lower' },
  { text: 'Online multiplayer and bots', start: 31.7, end: 34.0, look: 'lower' },
  { text: 'Special towers', start: 34.2, end: 40.5, look: 'lower' },
  { text: 'Tournaments', start: 40.8, end: 42.9, look: 'lower' },
  { text: ENDINGS[END], start: 51.0, end: 55.0, look: 'end' },
];

const LENGTH = CUT.reduce((sum, s) => sum + s.length, 0);

// --- Recording -----------------------------------------------------------------------------

function clipUrl(clip: Clip): string {
  if (clip.url !== undefined)
    return clip.slow === undefined ? clip.url : `${clip.url}&trailerSlow=${clip.slow}`;
  const q = new URLSearchParams({
    autostart: '1',
    autopilot: '1',
    clean: '1',
    level: '7',
    seed: '7',
    lang: LANG,
    ...(SET === 'loops' ? { labels: '0' } : {}),
    ...clip.params,
    ...(clip.slow === undefined ? {} : { trailerSlow: String(clip.slow) }),
    ...(SHAKE === 1 ? {} : { shake: String(SHAKE) }),
    // No aiming cursor nor the towers' emblems in combat; the pieces' ghosts stay (the user's).
    reticle: '0',
  });
  return `${BASE}/?${q}`;
}

/** Waits for a clip's moment in the page. */
async function waitFor(page: Page, moment: Moment): Promise<void> {
  if (moment.kind === 'wipe') {
    // The banner crossing the middle: it eases in, creeping down from the top for seconds before
    // it sweeps, and timed from its first sight the cut showed only the creep (2026-11-04).
    await page.waitForFunction(
      () => {
        const banner = document.querySelector('.phase-call');
        if (banner === null) return false;
        const box = banner.getBoundingClientRect();
        return box.top + box.height / 2 > innerHeight / 2;
      },
      null,
      { timeout: 600_000, polling: 8 },
    );
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

/**
 * The graphics card's own video encoder (VAAPI), only if asked (`TRAILER_ENCODER=vaapi`): tried
 * to spare the CPU, it made things worse on this machine — its graphics share memory with the
 * processor, and frames repeated 38–43% round the heavy moments where x264 had 16% (2026-11-04).
 * The heavy moments are filmed slowed instead (`Clip.slow`).
 */
const VAAPI = process.env['TRAILER_ENCODER'] === 'vaapi' && existsSync('/dev/dri/renderD128');

/** ffmpeg filming the page's area of the screen, at a quality to cut and grade later. */
function film(rect: { x: number; y: number }, file: string): ChildProcess {
  let args: string[];
  if (WINDOWS && WIN_CAPTURE === 'ddagrab') {
    const grab = `ddagrab=output_idx=0:framerate=${FPS}:draw_mouse=0:offset_x=${rect.x}:offset_y=${rect.y}:video_size=${W}x${H}`;
    // NVENC takes the card's frames as they are; x264 needs them brought down to memory first.
    const encode =
      WIN_ENCODER === 'nvenc'
        ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'constqp', '-qp', '14']
        : [
            '-vf',
            'hwdownload,format=bgra',
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-crf',
            '10',
            '-pix_fmt',
            'yuv444p',
          ];
    args = ['-f', 'lavfi', '-i', grab, ...encode];
  } else if (WINDOWS) {
    const grab = [
      '-f',
      'gdigrab',
      '-draw_mouse',
      '0',
      '-framerate',
      String(FPS),
      '-offset_x',
      String(rect.x),
      '-offset_y',
      String(rect.y),
      '-video_size',
      `${W}x${H}`,
      '-i',
      'desktop',
    ];
    const encode =
      WIN_ENCODER === 'nvenc'
        ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'constqp', '-qp', '14']
        : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-pix_fmt', 'yuv444p'];
    args = [...grab, ...encode];
  } else {
    const grab = [
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
    ];
    const encode = VAAPI
      ? ['-vf', 'format=nv12,hwupload', '-c:v', 'h264_vaapi', '-qp', '12']
      : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-pix_fmt', 'yuv444p'];
    args = [...(VAAPI ? ['-vaapi_device', '/dev/dri/renderD128'] : []), ...grab, ...encode];
  }
  return spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args, file], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

/**
 * The share of a clip's frames that repeat the one before, from `fromS` for `forS` seconds: the
 * frames the game or the film dropped, which show as stutter.
 */
function repeats(file: string, fromS: number, forS: number, k = 1): number {
  const out = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-ss',
      String(fromS),
      '-t',
      String(forS),
      '-i',
      file,
      '-vf',
      `setpts=${k}*PTS,fps=${FPS},mpdecimate=hi=64:lo=32:frac=0.33,showinfo`,
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  );
  const kept = (out.stderr.match(/showinfo.*n:/g) ?? []).length;
  return 1 - kept / (forS * k * FPS);
}

async function stop(ffmpeg: ChildProcess): Promise<void> {
  await new Promise<void>((done) => {
    ffmpeg.on('exit', () => done());
    ffmpeg.stdin?.write('q');
  });
}

/**
 * Where the page stands on the screen, found rather than asked: the window's own idea of its
 * place put the browser's bar into the picture (the first calibration). A page marked magenta in
 * its top-left corner and cyan in its bottom-right is shown, the whole screen grabbed once, and
 * the marks found — the second proves the page is whole on the screen, at full size.
 */
async function locate(page: Page): Promise<{ x: number; y: number }> {
  await page.setContent(`<!doctype html><style>html,body{margin:0;width:${W}px;height:${H}px;background:#000}
i{position:fixed;width:8px;height:8px}</style>
<i style="left:0;top:0;background:#f0f"></i><i style="left:${W - 8}px;top:${H - 8}px;background:#0ff"></i>`);
  await page.waitForTimeout(600);
  // What is grabbed: the whole screen here; on Windows the window's own rectangle, by its place
  // on the desktop, which at 100% scaling is in the screen's pixels.
  let x0 = 0;
  let y0 = 0;
  let sw: number;
  let sh: number;
  let input: string[];
  if (WINDOWS) {
    const win = await page.evaluate(() => ({
      x: screenX,
      y: screenY,
      w: outerWidth,
      h: outerHeight,
    }));
    x0 = Math.max(0, win.x);
    y0 = Math.max(0, win.y);
    sw = win.w;
    sh = win.h;
    input = [
      '-f',
      'gdigrab',
      '-offset_x',
      String(x0),
      '-offset_y',
      String(y0),
      '-video_size',
      `${sw}x${sh}`,
      '-i',
      'desktop',
    ];
  } else {
    const size = /dimensions:\s+(\d+)x(\d+)/.exec(
      spawnSync('xdpyinfo', { encoding: 'utf8' }).stdout,
    );
    if (size === null) throw new Error('xdpyinfo could not tell the screen size');
    sw = Number(size[1]);
    sh = Number(size[2]);
    input = ['-f', 'x11grab', '-video_size', `${sw}x${sh}`, '-i', `${DISPLAY}+0,0`];
  }
  const grab = spawnSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      ...input,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ],
    { maxBuffer: sw * sh * 3 + 1024 },
  );
  const px = grab.stdout as Buffer;
  if (px.length < sw * sh * 3)
    throw new Error(`the screen could not be grabbed: ${String(grab.stderr)}`);
  const at = (x: number, y: number): [number, number, number] => {
    const i = (y * sw + x) * 3;
    return [px[i]!, px[i + 1]!, px[i + 2]!];
  };
  const near = (c: [number, number, number], r: number, g: number, b: number): boolean =>
    Math.abs(c[0] - r) < 40 && Math.abs(c[1] - g) < 40 && Math.abs(c[2] - b) < 40;
  for (let y = 0; y < sh - H + 1; y++) {
    for (let x = 0; x < sw - W + 1; x++) {
      if (!near(at(x, y), 255, 0, 255)) continue;
      // The square's corner, and its partner where a whole page would put it.
      if (y > 0 && near(at(x, y - 1), 255, 0, 255)) continue;
      if (x > 0 && near(at(x - 1, y), 255, 0, 255)) continue;
      // Within a few pixels: the page's last four columns showed covered on this desktop.
      if (![0, 2, 4, 6].some((d) => near(at(x + W - 1 - d, y + H - 1), 0, 255, 255))) {
        throw new Error(
          `the page's corner is at ${x},${y} but its far corner is not on screen whole`,
        );
      }
      return { x: x0 + x, y: y0 + y };
    }
  }
  throw new Error('the page was not found on the screen: is the window covered?');
}

async function record(names: string[], calibrate: boolean): Promise<void> {
  mkdirSync(join(OUT, 'clips'), { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--enable-gpu',
      // ANGLE on OpenGL here; Windows keeps Chrome's own, on Direct3D.
      ...(WINDOWS ? [] : ['--use-angle=gl']),
      '--ignore-gpu-blocklist',
      '--mute-audio',
      ...(FULLSCREEN ? ['--kiosk'] : [`--window-position=${WINDOW_AT}`]),
      '--force-device-scale-factor=1',
      // Chrome offered to translate the page over it (the first calibration, 2026-11-04).
      '--disable-features=Translate',
      '--lang=en-GB',
    ],
  });
  // Four columns wider than the film: the page's last four showed covered by the window's frame on
  // this desktop (2026-11-04), so they fall outside the 1920 filmed.
  const page = await (
    await browser.newContext({ viewport: FULLSCREEN ? null : { width: W + 4, height: H } })
  ).newPage();
  // Room round the page: the window Playwright makes for a 1920 × 1080 page showed only 1059 rows
  // of it on this desktop, and ignores --window-size (2026-11-04); the page stays 1920 × 1080.
  // The page's clock slowed where the address asks (`trailerSlow`, `Clip.slow`): the frame times,
  // `performance.now` and `Date.now` alike, so the game, its camera, its effects and the
  // autopilot all slow together.
  // As text: a function would be sent as tsx compiled it, with helpers the page lacks.
  await page.context().addInitScript(`(() => {
    const k = Number(new URLSearchParams(location.search).get('trailerSlow'));
    if (!(k > 0 && k < 1)) return;
    const realNow = performance.now.bind(performance);
    const t0 = realNow();
    const slowed = (t) => t0 + (t - t0) * k;
    performance.now = () => slowed(realNow());
    const realDate = Date.now.bind(Date);
    const d0 = realDate();
    Date.now = () => d0 + (realDate() - d0) * k;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((ts) => cb(slowed(ts)));
    window.__trailerSlow = k;
  })();`);
  const cdp = await page.context().newCDPSession(page);
  if (!FULLSCREEN) {
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    const [left, top] = WINDOW_AT.split(',').map(Number);
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { left: left ?? 40, top: top ?? 40, width: W + 100, height: H + 160 },
    });
  }
  page.on('pageerror', (e) => console.error(`  page error: ${e.message}`));
  await page.goto(`${BASE}/?lang=en`);
  await page.waitForTimeout(1500);
  const rect = await locate(page);
  await page.goto(`${BASE}/?lang=en`);
  await page.waitForTimeout(1500);
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

  const times: Record<string, { moment: number; slow?: number }> = existsSync(
    join(OUT, 'clips', 'moments.json'),
  )
    ? JSON.parse(readFileSync(join(OUT, 'clips', 'moments.json'), 'utf8'))
    : {};
  for (const clip of SET === 'loops' ? LOOP_CLIPS : CLIPS) {
    if (names.length > 0 && !names.includes(clip.name)) continue;
    // A loop with no banner has no words to translate: filmed once, in English.
    if (SET === 'loops' && LANG !== 'en' && clip.banner !== true) continue;
    console.log(clip.name);
    const k = clip.slow ?? 1;
    await page.goto(clipUrl(clip));
    if (
      clip.slow !== undefined &&
      (await page.evaluate(
        () => (window as unknown as { __trailerSlow?: number }).__trailerSlow,
      )) === undefined
    )
      throw new Error(`${clip.name}: the page's clock was not slowed`);
    // Not CSS animations through the DevTools protocol as well: that slows the frame times a second
    // time, the game and its camera then reading two clocks — it froze an eight-player match,
    // and ran the quarter-speed wipes at a sixteenth (2026-11-04).
    // The fast-forward done and the look drawn: the board up, a moment to settle.
    await page.waitForSelector('#stage', { timeout: 120_000 });
    await page.waitForTimeout(clip.settleMs ?? 2500);
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
      await page.waitForTimeout((clip.before * 1000) / k);
      await waitFor(page, clip.moment).catch((e: Error) =>
        console.error(`  never came: ${e.message.split('\n')[0]}`),
      );
    }
    // In the cut's seconds: a slowed clip is sped up again.
    const moment = (clip.moment.kind === 'ready' ? 0.3 : (Date.now() - startedAt) / 1000) * k;
    await page.waitForTimeout((clip.after * 1000) / k + 200);
    await stop(ffmpeg);
    times[clip.name] = { moment, ...(clip.slow === undefined ? {} : { slow: clip.slow }) };
    // Measured in the film as it will be cut: a slowed clip's every other frame.
    const share = repeats(file, Math.max(0, moment / k - 0.5 / k), 2 / k, k);
    console.log(`  repeated frames round its moment: ${(share * 100).toFixed(0)}%`);
    writeFileSync(join(OUT, 'clips', 'moments.json'), JSON.stringify(times, null, 2));
    console.log(`  its moment ${moment.toFixed(2)} s in`);
  }
  await browser.close();
}

// --- Captions ------------------------------------------------------------------------------

/** Each caption drawn once as a transparent picture the size of the frame, in the game's fonts. */
async function captions(): Promise<void> {
  mkdirSync(join(OUT, CAPTIONS_DIR), { recursive: true });
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
    await page.screenshot({ path: join(OUT, CAPTIONS_DIR, `${i}.png`), omitBackground: true });
  }
  await browser.close();
  console.log(`${CAPTIONS.length} captions in ${join(OUT, CAPTIONS_DIR)}`);
}

// --- Assembly ------------------------------------------------------------------------------

/**
 * The music as loud as the game's (ARCHIVE: every track at −14 LUFS, peaks under −1.5 dBTP,
 * two-pass `loudnorm`). The trailer's track, mastered at −9.0 LUFS with peaks at +0.5 dBTP, had
 * gone in as it was: the trailer at −9.3 LUFS, some 5 dB over the game and most videos (the
 * user's ear, measured 2026-11-05). Measured first, then brought down linearly — one gain, the
 * music's dynamics kept, which its range of 5.4 LU allows.
 */
const LOUDNESS = { I: -14, TP: -1.5, LRA: 11 };

function musicChain(): string {
  return `apad,atrim=duration=${LENGTH}`;
}

function loudnormFilter(): string {
  const target = `I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}`;
  const pass = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      MUSIC,
      '-af',
      `${musicChain()},loudnorm=${target}:print_format=json`,
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  );
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(pass.stderr ?? '');
  if (pass.status !== 0 || json === null) throw new Error('measuring the music failed');
  const m = JSON.parse(json[0]) as Record<string, string>;
  return (
    `loudnorm=${target}:linear=true:measured_I=${m['input_i']}:measured_TP=${m['input_tp']}` +
    `:measured_LRA=${m['input_lra']}:measured_thresh=${m['input_thresh']}` +
    `:offset=${m['target_offset']}`
  );
}

/** The cut, captioned, with the music, encoded as Valve asks: H.264 and AAC, 1080p at 60. */
function assemble(): void {
  const moments: Record<string, { moment: number; slow?: number }> = JSON.parse(
    readFileSync(join(OUT, 'clips', 'moments.json'), 'utf8'),
  );
  const inputs: string[] = [];
  const filters: string[] = [];
  CUT.forEach((shot, i) => {
    const at = moments[shot.clip]?.moment;
    const k = moments[shot.clip]?.slow ?? 1;
    if (at === undefined) throw new Error(`no recording of ${shot.clip}`);
    inputs.push('-i', join(OUT, 'clips', `${shot.clip}.mkv`));
    const start = Math.max(0, at + shot.from);
    filters.push(
      `[${i}:v]setpts=${k}*PTS,fps=${FPS},trim=start=${start.toFixed(3)}:duration=${shot.length.toFixed(3)},setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p[s${i}]`,
    );
  });
  filters.push(`${CUT.map((_, i) => `[s${i}]`).join('')}concat=n=${CUT.length}:v=1:a=0[cut]`);
  let last = 'cut';
  CAPTIONS.forEach((c, i) => {
    const n = CUT.length + i;
    inputs.push('-loop', '1', '-t', String(LENGTH), '-i', join(OUT, CAPTIONS_DIR, `${i}.png`));
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
  filters.push(`[${music}:a]${musicChain()},${loudnormFilter()},aresample=48000[audio]`);
  const file = join(OUT, `BollfortTrailer${END_SUFFIX}.mp4`);
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
