/**
 * The Steam achievements' icons (docs/STEAM_ACHIEVEMENTS.md AC4): each achievement's icon and its
 * locked grey twin at 256 × 256, as Steamworks takes them, named by API name (`FIRST_WIN.png`,
 * `FIRST_WIN_locked.png`), and a contact sheet showing each at 256, 64 — Steam's overlay and
 * library — and 32 px, on Steam's blue, after an overview of them all at 96 px (`overview.png`).
 *
 *   npm run dev -w @bollfort/client                    # in another terminal
 *   npm run achievements -w @bollfort/storeart -- [outdir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

const BASE = process.env['BASE'] ?? 'http://localhost:5173';
const OUT = resolve(process.argv[2] ?? '/tmp/achievements');

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.error(`  page error: ${e.message}`));
await page.goto(`${BASE}/?icons=achievements`);
await page.waitForSelector('body[data-done]', { timeout: 120_000 });
const icons = await page.$$eval('img[data-id]', (imgs) =>
  imgs.map((i) => ({
    id: (i as HTMLImageElement).dataset['id']!,
    locked: (i as HTMLImageElement).dataset['locked'] === 'true',
    src: (i as HTMLImageElement).src,
  })),
);
const ids: string[] = [];
for (const { id, locked, src } of icons) {
  writeFileSync(
    join(OUT, `${id}${locked ? '_locked' : ''}.png`),
    Buffer.from(src.split(',')[1]!, 'base64'),
  );
  if (!locked) ids.push(id);
}
console.log(`${ids.length} achievements, ${icons.length} icons`);

const cards = ids
  .map(
    (id) =>
      `<figure><div class="row"><img class="big" src="${id}.png"><img class="big" src="${id}_locked.png"></div>` +
      `<div class="row"><img class="mid" src="${id}.png"><img class="small" src="${id}.png">` +
      `<img class="mid" src="${id}_locked.png"><img class="small" src="${id}_locked.png"></div>` +
      `<figcaption>${id}</figcaption></figure>`,
  )
  .join('');
// Every icon at once, in Steam's order, unlocked over locked: the set judged as a set.
const overview =
  `<section id="overview"><div class="grid">${ids.map((id) => `<img class="ov" src="${id}.png" title="${id}">`).join('')}</div>` +
  `<div class="grid">${ids.map((id) => `<img class="ov" src="${id}_locked.png" title="${id}">`).join('')}</div></section>`;
const sheet = join(OUT, 'index.html');
writeFileSync(
  sheet,
  `<!doctype html><meta charset="utf-8"><title>Bollfort achievement icons</title><style>
  body{font:14px system-ui,sans-serif;background:#1b2838;color:#c7d5e0;margin:24px;width:1640px}
  main{display:flex;flex-wrap:wrap;gap:22px}figure{margin:0}
  .row{display:flex;gap:8px;align-items:end;margin-bottom:8px}
  .big{width:256px;height:256px}.mid{width:64px;height:64px}.small{width:32px;height:32px}
  figcaption{color:#8f98a0}#overview{padding:8px 0 24px}
  .grid{display:grid;grid-template-columns:repeat(12,96px);gap:10px;margin-bottom:16px}.ov{width:96px;height:96px}</style>
  <h1>Bollfort — achievement icons <small>256, 64 and 32 px, unlocked and locked</small></h1>${overview}<main>${cards}</main>`,
);
const view = await browser.newPage({ viewport: { width: 1690, height: 900 } });
await view.goto(pathToFileURL(sheet).href);
await view.screenshot({ path: join(OUT, 'sheet.png'), fullPage: true });
await (await view.$('#overview'))!.screenshot({ path: join(OUT, 'overview.png') });
await browser.close();
console.log(`icons, index.html and sheet.png in ${OUT}`);
