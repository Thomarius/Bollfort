/**
 * Steam's screenshots (STEAM.md §9.2): play as a player sees it — the piece in hand, the cannon's
 * ghost, the reticle, "You" in the bar — at 1920 × 1080, Valve's size, across the game's kinds of
 * match, looks, phases, changes of look and special towers. The person's seat is played by a bot
 * and shown as a person plays it (`&autopilot=1`, `client/src/autopilot.ts`); the corner's buttons
 * are left out (`&clean=1`). A contact sheet to choose from.
 *
 *   npm run dev -w @bollfort/client                         # in another terminal
 *   npm run shots -w @bollfort/storeart -- [outdir] [shot…]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium, type Page } from 'playwright';

const BASE = process.env['BASE'] ?? 'http://localhost:5173';
const OUT = resolve(process.argv[2] ?? '/tmp/screenshots');
const ONLY = process.argv.slice(3);

interface Shot {
  name: string;
  /** What it shows, for the contact sheet. */
  note: string;
  params: Record<string, string>;
  /** How long to let it play after the board is up. */
  waitMs: number;
  /** Or a moment to wait for, then take it. */
  when?: (page: Page) => Promise<void>;
}

/** The person's seat resting on a move: a piece in hand on its spot, a castle about to be chosen. */
function resting(kind: string, afterMs = 0) {
  return async (page: Page): Promise<void> => {
    await page.waitForTimeout(afterMs);
    await page.waitForFunction(
      (k) => document.documentElement.dataset['autopilot'] === `resting:${k}`,
      kind,
      { timeout: 120_000, polling: 16 },
    );
  };
}

/**
 * A tower's effect as it fires — `lightning`, `laser`, `wave`, `biggest` (its crater) — marked on
 * the page by the match screen (`data-effect`), then `delayMs` for it to show at its fullest.
 */
function effect(kind: string, delayMs: number, afterMs = 0) {
  return async (page: Page): Promise<void> => {
    await page.waitForTimeout(afterMs);
    const before = await page.evaluate(() =>
      Number(document.documentElement.dataset['effects'] ?? 0),
    );
    await page.waitForFunction(
      ([k, n]) =>
        document.documentElement.dataset['effect'] === k &&
        Number(document.documentElement.dataset['effects'] ?? 0) > (n as number),
      [kind, before] as const,
      { timeout: 150_000, polling: 8 },
    );
    await page.waitForTimeout(delayMs);
  };
}

/** The announcement's banner halfway down: the change of look half done. */
async function midWipe(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const banner = document.querySelector('.phase-call');
      if (banner === null) return false;
      const box = banner.getBoundingClientRect();
      const middle = box.top + box.height / 2;
      return middle > innerHeight * 0.42 && middle < innerHeight * 0.58;
    },
    null,
    { timeout: 120_000, polling: 16 },
  );
}

/**
 * A two-player match from a cannon phase deep in, special towers on: the tower bought there and
 * fired in the combat after. Jumped straight into a combat, no tower was bought on the way and
 * none fired (2026-11-04).
 */
const DUEL_TOWERS = { players: '2', snapshot: 'cannon_place', round: '4', specials: '1' };

const SHOTS: Shot[] = [
  // The user's favourites of the first round, kept (2026-11-04).
  {
    name: 'wipe-cyberpunk',
    note: 'The change of look: Medieval giving way to Cyberpunk under "Fire!"',
    params: {
      players: '4',
      snapshot: 'cannon_place',
      round: '2',
      buildStyle: 'pixel',
      combatStyle: 'cyberpunk',
    },
    waitMs: 0,
    when: midWipe,
  },
  {
    name: 'combat-noir',
    note: 'Combat, two players, Noir',
    params: { players: '2', snapshot: 'combat', round: '4', style: 'noir' },
    waitMs: 7000,
  },
  // Two players, late: big castles, much destruction, every tile large.
  {
    name: 'duel-medieval-late',
    note: 'Two players, round 7, Medieval: big castles under fire',
    params: { players: '2', snapshot: 'combat', round: '7', style: 'pixel' },
    waitMs: 8000,
  },
  {
    name: 'duel-pirates-build',
    note: 'Two players, round 6, Pirates: rebuilding after a barrage, a piece in hand',
    params: { players: '2', snapshot: 'build', round: '6', style: 'pirates' },
    waitMs: 0,
    when: resting('place_piece', 4000),
  },
  {
    name: 'wipe-duel-mythos',
    note: 'Two players, round 5: Medieval giving way to Mythos under "Fire!"',
    params: {
      players: '2',
      snapshot: 'cannon_place',
      round: '5',
      buildStyle: 'pixel',
      combatStyle: 'mythology',
    },
    waitMs: 0,
    when: midWipe,
  },
  // Close up on the player's own island.
  {
    name: 'zoom-sakura-build',
    note: 'Close up, round 5, Sakura: a piece in hand by the castle',
    params: {
      players: '4',
      snapshot: 'build',
      round: '5',
      style: 'sakura',
      cameraZoom: '1.9',
      cameraOn: 'you',
    },
    waitMs: 0,
    when: resting('place_piece', 5000),
  },
  {
    name: 'zoom-christmas-cannons',
    note: 'Close up, round 4, Christmas: placing cannons',
    params: {
      players: '4',
      snapshot: 'cannon_place',
      round: '4',
      style: 'christmas',
      cameraZoom: '1.9',
      cameraOn: 'you',
    },
    waitMs: 0,
    when: resting('place_cannon', 1500),
  },
  {
    name: 'zoom-medieval-combat',
    note: 'Close up between two rivals, round 6, Medieval: walls breaking',
    params: {
      players: '4',
      snapshot: 'combat',
      round: '6',
      style: 'pixel',
      cameraZoom: '1.7',
      cameraOn: 'duel',
    },
    waitMs: 6000,
  },
  // The towers' effects, caught as they fire.
  {
    name: 'tower-lightning',
    note: "The Lightning Tower's chain strike, Cyberpunk",
    params: { ...DUEL_TOWERS, style: 'cyberpunk', tower: 'lightning2' },
    waitMs: 0,
    when: effect('lightning', 60),
  },
  {
    name: 'tower-subwoofer',
    note: "The Subwoofer's wave, Anime",
    params: { ...DUEL_TOWERS, style: 'anime', tower: 'subwoofer2' },
    waitMs: 0,
    when: effect('wave', 450),
  },
  {
    name: 'tower-bertha',
    note: "The Allerdickste Bertha's explosion, Halloween",
    params: { ...DUEL_TOWERS, style: 'halloween', tower: 'biggest2' },
    waitMs: 0,
    when: effect('biggest', 120),
  },
  {
    name: 'tower-laser',
    note: "The Laser Tower's beam, Electric",
    params: { ...DUEL_TOWERS, style: 'electric', tower: 'laser2' },
    waitMs: 0,
    when: effect('laser', 40),
  },
  // Many players, late.
  {
    name: 'late-eight-oktoberfest',
    note: 'Eight players, round 7, Oktoberfest',
    params: { players: '8', snapshot: 'combat', round: '7', style: 'oktoberfest' },
    waitMs: 7000,
  },
  {
    name: 'teams-pirates',
    note: 'Eight players in teams of two, Pirates, combat',
    params: { players: '8', teams: '2', snapshot: 'combat', round: '2', style: 'pirates' },
    waitMs: 7000,
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  args: ['--enable-gpu', '--use-angle=gl', '--ignore-gpu-blocklist'],
});
const made: Shot[] = [];
for (const shot of SHOTS) {
  if (ONLY.length > 0 && !ONLY.includes(shot.name)) continue;
  console.log(shot.name);
  const q = new URLSearchParams({
    autostart: '1',
    autopilot: '1',
    clean: '1',
    level: '7',
    seed: '7',
    lang: 'en',
    ...shot.params,
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.error(`  page error: ${e.message}`));
  await page.goto(`${BASE}/?${q}`);
  await page.waitForSelector('#stage', { timeout: 60_000 });
  // A moment never caught — an effect nobody fired in time — is taken as it stands, and said.
  if (shot.when)
    await shot
      .when(page)
      .catch((e: Error) => console.error(`  not caught: ${e.message.split('\n')[0]}`));
  else await page.waitForTimeout(shot.waitMs);
  await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
  await page.close();
  made.push(shot);
}
await browser.close();

// Every screenshot in the folder, a partial run's with the rest.
const shown = SHOTS.filter((s) => existsSync(join(OUT, `${s.name}.png`)));
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Bollfort screenshots</title><style>
body{font:14px system-ui,sans-serif;background:#1b1e25;color:#e8e8ea;margin:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(560px,1fr));gap:20px}
figure{margin:0}img{width:100%;display:block}figcaption{color:#9aa0ab;margin-top:6px}</style>
<h1>Bollfort — screenshot candidates (1920 × 1080)</h1><div class="grid">${shown
    .map(
      (s) =>
        `<figure><a href="${s.name}.png"><img src="${s.name}.png"></a><figcaption><b>${s.name}</b> — ${s.note}</figcaption></figure>`,
    )
    .join('')}</div>`,
);
console.log(`\n${made.length} screenshots and index.html in ${OUT}`);
