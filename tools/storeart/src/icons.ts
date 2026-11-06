/**
 * The app's icon candidates (ARCHIVE 15zo): every style's crowned castle, its castle and
 * cannon in their ring, and its lettering's B, at 512 × 512 — Steam's shortcut icon, and the
 * desktop app's — with a contact sheet showing each at 184 pixels (Steam's app icon) and 32
 * (a taskbar's), where an icon is won or lost.
 *
 *   npm run dev -w @bollfort/client                    # in another terminal
 *   npm run icons -w @bollfort/storeart -- [outdir] [castle|ring|letter…]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

const BASE = process.env['BASE'] ?? 'http://localhost:5173';
const OUT = resolve(process.argv[2] ?? '/tmp/icons');
const KINDS = ['castle', 'ring', 'letter', 'keep', 'bare'] as const;
const ONLY = process.argv.slice(3);
const SIZE = 512;

const TITLES: Record<(typeof KINDS)[number], string> = {
  castle: 'The crowned main castle in its ring',
  ring: 'A castle and a cannon in their ring',
  letter: "The title's B in each style's lettering",
  keep: 'The crowned castle alone, sealed but its wall left undrawn',
  bare: 'The castle alone, no crown, sealed but its wall left undrawn',
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  args: ['--enable-gpu', '--use-angle=gl', '--ignore-gpu-blocklist'],
});
const made: Record<string, string[]> = {};
for (const kind of KINDS) {
  if (ONLY.length > 0 && !ONLY.includes(kind)) continue;
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.error(`  page error: ${e.message}`));
  await page.goto(`${BASE}/?icons=app&kind=${kind}&size=${SIZE}`);
  await page.waitForSelector('[data-done]', { timeout: 300_000 });
  const icons = await page.$$eval('img[data-style]', (imgs) =>
    imgs.map((i) => ({
      style: (i as HTMLImageElement).dataset['style']!,
      src: (i as HTMLImageElement).src,
    })),
  );
  made[kind] = [];
  for (const { style, src } of icons) {
    const file = `${kind}-${style}.png`;
    writeFileSync(join(OUT, file), Buffer.from(src.split(',')[1]!, 'base64'));
    made[kind].push(file);
  }
  console.log(`${kind}: ${icons.length}`);
  await page.close();
}

// The contact sheet: each candidate at Steam's app icon's size with a taskbar's beside it.
const sections = Object.entries(made).map(([kind, files]) => {
  const cards = files
    .map((f) => {
      const style = f.slice(kind.length + 1, -4);
      return `<figure><img class="big" src="${f}"><img class="small" src="${f}"><figcaption>${style}</figcaption></figure>`;
    })
    .join('');
  return `<section><h2>${TITLES[kind as (typeof KINDS)[number]]}</h2><div class="row">${cards}</div></section>`;
});
const sheet = join(OUT, 'index.html');
writeFileSync(
  sheet,
  `<!doctype html><meta charset="utf-8"><title>Bollfort icon candidates</title><style>
  body{font:14px system-ui,sans-serif;background:#1b2838;color:#c7d5e0;margin:24px;width:1720px}
  h2{font-size:18px;margin:28px 0 10px}.row{display:flex;flex-wrap:wrap;gap:14px}
  figure{margin:0;display:grid;grid-template-columns:184px 32px;gap:8px;align-items:end}
  .big{width:184px;height:184px}.small{width:32px;height:32px}
  figcaption{grid-column:1/3;color:#8f98a0}</style>
  <h1>Bollfort — icon candidates <small>184 px and 32 px, on Steam's blue</small></h1>${sections.join('')}`,
);
// The sheet as pictures too, one a section, to look at without a browser.
const view = await browser.newPage({ viewport: { width: 1770, height: 900 } });
await view.goto(pathToFileURL(sheet).href);
const boxes = await view.$$('section');
for (const [k, box] of boxes.entries()) {
  await box.screenshot({ path: join(OUT, `sheet-${Object.keys(made)[k]}.png`) });
}
await browser.close();
console.log(`\nicons and index.html in ${OUT}`);
