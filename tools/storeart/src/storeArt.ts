/**
 * Steam's store art from the game itself (STEAM.md §9.2): every capsule, the library's art and
 * its logo, rendered by the client's store-art mode (`client/src/storeArt.ts`) from a watched
 * match, and written with a contact sheet to choose from.
 *
 *   npm run dev -w @bollfort/client                    # in another terminal
 *   npm start -w @bollfort/storeart -- [outdir] [asset…]
 *   npm start -w @bollfort/storeart -- assets/store final   # the chosen set, under Steam's names
 *
 * The direction, the user's (2026-11-04, from the first round): the Medieval board under
 * Minimal's rainbow lettering; a band behind the title only on the small capsule; and the
 * game's change of look mid-match held still across the picture, Medieval below the line and
 * another look above it — so each asset is tried plain and split with each of `SPLITS`.
 *
 * Sizes from Valve's pages (read 2026-11-04): the store's header, small, main and vertical
 * capsules; the library's capsule, hero (no text, a safe area of 860 × 380 at its centre) and
 * logo (1280 wide, transparent). Every capsule's only text is the title, legible.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium, type Browser } from 'playwright';

const BASE = process.env['BASE'] ?? 'http://localhost:5173';
const OUT = resolve(process.argv[2] ?? '/tmp/storeart');
const ONLY = process.argv.slice(3);

/** The board every picture shows, and the title's lettering. */
const BOARD = 'pixel';
const LETTERING = 'flat';

/** The looks tried above the line of a change of look: each far from Medieval. */
const SPLITS = ['cyberpunk', 'anime', 'pirates', 'mythology'] as const;

const NAMES: Record<string, string> = {
  pixel: 'Medieval',
  cyberpunk: 'Cyberpunk',
  anime: 'Anime',
  pirates: 'Pirates',
  mythology: 'Mythos',
};

interface Asset {
  name: string;
  width: number;
  height: number;
  /** Islands on the board: two side by side for a wide picture, four in a grid for a tall one. */
  players: number;
  /** Where the title stands, or none (the hero allows no text). */
  title: 'center' | 'top' | 'none';
  /** The letters' width, as a share of the picture's. */
  titleWidth: number;
  /** A band behind the title, where it must nearly fill a small picture. */
  band: boolean;
  /** Where the line of a change of look stands, as a share of the height. */
  split: number;
  note: string;
}

const ASSETS: Asset[] = [
  {
    name: 'header',
    width: 920,
    height: 430,
    players: 2,
    title: 'center',
    titleWidth: 0.66,
    band: false,
    split: 0.5,
    note: 'Store header capsule, and the library header',
  },
  {
    name: 'small',
    width: 462,
    height: 174,
    players: 2,
    title: 'center',
    titleWidth: 0.9,
    band: true,
    split: 0.5,
    note: 'Small capsule: the logo should nearly fill it',
  },
  {
    name: 'main',
    width: 1232,
    height: 706,
    players: 2,
    title: 'center',
    titleWidth: 0.6,
    band: false,
    split: 0.5,
    note: 'Main capsule',
  },
  {
    name: 'vertical',
    width: 748,
    height: 896,
    players: 4,
    title: 'top',
    titleWidth: 0.82,
    band: false,
    split: 0.5,
    note: 'Vertical capsule',
  },
  {
    name: 'library-capsule',
    width: 600,
    height: 900,
    players: 4,
    title: 'top',
    titleWidth: 0.86,
    band: false,
    split: 0.5,
    note: 'Library capsule',
  },
  {
    name: 'hero',
    width: 3840,
    height: 1240,
    players: 2,
    title: 'none',
    titleWidth: 0,
    band: false,
    split: 0.5,
    note: 'Library hero: no text; keep the middle 860 × 380 clear of anything vital',
  },
  // The events' art (STORE_PAGE.md §4.5), for the Coming Soon announcement and after: the cover
  // is required for any event, the header goes at its top.
  {
    name: 'event-cover',
    width: 800,
    height: 450,
    players: 2,
    title: 'center',
    titleWidth: 0.66,
    band: false,
    split: 0.5,
    note: 'Event cover: required for every event',
  },
  {
    name: 'event-header',
    width: 1920,
    height: 622,
    players: 2,
    title: 'center',
    titleWidth: 0.5,
    band: false,
    split: 0.5,
    note: "Event header: check Valve's template for its safe area",
  },
];

/** A match deep enough for walls, guns and shots in the air, by bots of the top level. */
function sceneUrl(asset: Asset, above: string | null): string {
  const q = new URLSearchParams({
    storeArt: 'scene',
    autostart: '1',
    watch: '1',
    players: String(asset.players),
    level: '8',
    seed: '7',
    snapshot: 'combat',
    round: '3',
    combatStyle: BOARD,
    buildStyle: above ?? BOARD,
    titleStyle: LETTERING,
    title: asset.title,
    titleWidth: String(asset.titleWidth),
    shade: asset.band ? 'band' : '1',
    lang: 'en',
  });
  if (above !== null) q.set('split', String(asset.split));
  return `${BASE}/?${q}`;
}

async function shoot(
  browser: Browser,
  url: string,
  width: number,
  height: number,
  file: string,
  transparent = false,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => console.error(`  page error: ${e.message}`));
  await page.goto(url);
  // The fast-forward to the round, the look made, the title loaded, then shots in the air:
  // combat opens with every gun ready, so a few seconds in the sky is busiest; a split's second
  // look is readied for a second before the line shows it.
  await page.waitForFunction(() => document.documentElement.dataset['storeArt'] === 'ready', null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(transparent ? 300 : 7500);
  await page.screenshot({ path: file, omitBackground: transparent });
  await page.close();
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  args: ['--enable-gpu', '--use-angle=gl', '--ignore-gpu-blocklist'],
});
const made: { asset: Asset; file: string; label: string }[] = [];

/**
 * The user's choice (2026-11-04, from the second round): Cyberpunk above the line everywhere,
 * the small capsule plain, the rainbow logo. `final` renders exactly these under Steam's names
 * — the set in `assets/store/` — for when a look has changed and the art should follow it.
 */
const CHOSEN: Record<string, { above: string | null; files: string[] }> = {
  header: { above: 'cyberpunk', files: ['header_capsule.png', 'library_header.png'] },
  small: { above: null, files: ['small_capsule.png'] },
  main: { above: 'cyberpunk', files: ['main_capsule.png'] },
  vertical: { above: 'cyberpunk', files: ['vertical_capsule.png'] },
  'library-capsule': { above: 'cyberpunk', files: ['library_capsule.png'] },
  hero: { above: 'cyberpunk', files: ['library_hero.png'] },
};
const FINAL = ONLY.includes('final');

for (const asset of ASSETS) {
  if (FINAL) {
    // The events' art is not chosen yet: `final` makes only the set in `assets/store/`.
    const chosen = CHOSEN[asset.name];
    if (chosen === undefined) continue;
    const [first, ...copies] = chosen.files;
    console.log(chosen.files.join(', '));
    await shoot(
      browser,
      sceneUrl(asset, chosen.above),
      asset.width,
      asset.height,
      join(OUT, first!),
    );
    for (const copy of copies) copyFileSync(join(OUT, first!), join(OUT, copy));
    continue;
  }
  if (ONLY.length > 0 && !ONLY.includes(asset.name)) continue;
  for (const above of [null, ...SPLITS]) {
    const file = `${asset.name}-${above ?? 'plain'}.png`;
    const label = above === null ? 'Medieval' : `${NAMES[above]} above the line, Medieval below`;
    console.log(file);
    await shoot(browser, sceneUrl(asset, above), asset.width, asset.height, join(OUT, file));
    made.push({ asset, file, label });
  }
}

// The library's logo: the title alone, transparent, 1280 wide.
if (FINAL) {
  console.log('library_logo.png');
  await shoot(
    browser,
    `${BASE}/?storeArt=logo&titleStyle=${LETTERING}`,
    1280,
    260,
    join(OUT, 'library_logo.png'),
    true,
  );
} else if (ONLY.length === 0 || ONLY.includes('logo')) {
  const logo: Asset = {
    name: 'logo',
    width: 1280,
    height: 260,
    players: 0,
    title: 'center',
    titleWidth: 1,
    band: false,
    split: 0,
    note: 'Library logo: transparent, 1280 wide',
  };
  const file = 'logo.png';
  console.log(file);
  await shoot(
    browser,
    `${BASE}/?storeArt=logo&titleStyle=${LETTERING}`,
    1280,
    260,
    join(OUT, file),
    true,
  );
  made.push({ asset: logo, file, label: 'Rainbow title' });
}
await browser.close();

if (!FINAL) {
  // A contact sheet, each asset's candidates side by side at most 460 pixels wide, on a
  // chequer where the picture is transparent.
  const rows = [...new Set(made.map((m) => m.asset.name))].map((name) => {
    const items = made.filter((m) => m.asset.name === name);
    const { asset } = items[0]!;
    const cards = items
      .map(
        (m) =>
          `<figure><a href="${m.file}"><img src="${m.file}"></a><figcaption>${m.label}</figcaption></figure>`,
      )
      .join('');
    return `<section><h2>${name} <small>${asset.width} × ${asset.height} — ${asset.note}</small></h2><div class="row">${cards}</div></section>`;
  });
  writeFileSync(
    join(OUT, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Bollfort store art</title><style>
  body{font:14px system-ui,sans-serif;background:#1b1e25;color:#e8e8ea;margin:24px}
  h2{font-size:16px;margin:28px 0 8px}small{color:#9aa0ab;font-weight:400}
  .row{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}
  img{max-width:460px;max-height:420px;display:block;background:repeating-conic-gradient(#333 0 25%,#444 0 50%) 0 0/16px 16px}
  figcaption{color:#9aa0ab;margin-top:4px}</style><h1>Bollfort — store art candidates</h1>${rows.join('')}`,
  );
  console.log(`\n${made.length} pictures and index.html in ${OUT}`);
}
