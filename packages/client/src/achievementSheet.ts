import { achievementIcon, ICON_ORDER } from './achievementIcons.js';

/**
 * The Steam achievements' icons as pictures (`?icons=achievements`, a developer's page for
 * `tools/storeart`'s `achievements` script, AC4): each icon rendered at 256 px, and its grey
 * twin for a locked achievement made from it here — greyed, darkened — so the two never drift
 * apart. Each is an `<img data-id data-locked>` holding a PNG; `data-done` marks the page ready.
 */

const SIZE = 256;

/** The filter that makes the locked icon from the unlocked: grey, dimmed, a little flatter. */
const LOCKED = 'grayscale(1) brightness(0.62) contrast(0.85)';

async function render(svg: string, filter: string): Promise<string> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.filter = filter;
  ctx.drawImage(image, 0, 0, SIZE, SIZE);
  return canvas.toDataURL('image/png');
}

export async function showAchievementSheet(): Promise<void> {
  document.body.innerHTML = '';
  document.body.style.cssText =
    'margin:16px;background:#1b2838;display:flex;flex-wrap:wrap;gap:12px';
  for (const id of ICON_ORDER) {
    const svg = achievementIcon(id);
    for (const locked of [false, true]) {
      const img = document.createElement('img');
      img.src = await render(svg, locked ? LOCKED : 'none');
      img.dataset['id'] = id;
      img.dataset['locked'] = String(locked);
      img.width = SIZE;
      img.height = SIZE;
      img.title = id;
      document.body.append(img);
    }
  }
  document.body.dataset['done'] = '1';
}
