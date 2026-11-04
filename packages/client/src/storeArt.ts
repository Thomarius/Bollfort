import { ArtStyleSchema, defaultArtConfig, type ArtStyle } from '@bollfort/config';

import { GAME_TITLE, titleFor } from './titles.js';

/**
 * Steam's store art made from the game itself (STEAM.md §9.2): the page as a camera for
 * `tools/storeart`, which sets the window to an asset's size and takes the picture.
 *
 * - `?storeArt=scene` with a watched match (`&autostart=1&watch=1&snapshot=combat&round=3…`):
 *   only the board, filling the window, and over it the title in a style's own lettering —
 *   `&title=center|top|bottom|left|none`, `&titleWidth=0.6` (of the window's width), and
 *   `&shade=1` for a dark veil behind it or `&shade=band` for a band across the picture, as the
 *   game's announcements run, so the title reads on any board.
 * - `?storeArt=logo`: the title alone on a transparent page, filling its width, for the
 *   library's logo.
 *
 * `&split=` holds the line of a change of look across the picture (`storeArtSplit`).
 * `&titleStyle=` picks the lettering, the build look's style by default.
 */

/** Cells across the title's letters: five a letter and one between. */
const LETTER_CELLS = GAME_TITLE.length * 6 - 1;

/**
 * Where the line of a change of look stands, as a share of the picture's height, held still
 * (`&split=0.55`): the build look above it (`&buildStyle=`), the combat look below — the
 * game's wipe between styles mid-match, its most striking moment, caught in one picture.
 */
export function storeArtSplit(params: URLSearchParams): number | null {
  if (storeArtMode(params) !== 'scene') return null;
  const at = Number(params.get('split'));
  return params.get('split') !== null && at > 0 && at < 1 ? at : null;
}

export function storeArtMode(params: URLSearchParams): 'scene' | 'logo' | null {
  const mode = params.get('storeArt');
  return mode === 'scene' || mode === 'logo' ? mode : null;
}

function titleStyle(params: URLSearchParams): ArtStyle {
  for (const key of ['titleStyle', 'buildStyle', 'style']) {
    const parsed = ArtStyleSchema.safeParse(params.get(key));
    if (parsed.success) return parsed.data;
  }
  return 'pixel';
}

/**
 * The title as an image whose letters span `width` CSS pixels, its glow's padding left to
 * overhang, as the menu sizes it (`titleLayout`).
 */
function titleImage(style: ArtStyle, width: number): HTMLImageElement {
  const title = titleFor(style, defaultArtConfig);
  const scale = width / (LETTER_CELLS * title.cellPx);
  const img = document.createElement('img');
  img.className = 'store-title';
  img.src = title.src;
  img.style.imageRendering = title.smooth ? 'auto' : 'pixelated';
  img.addEventListener('load', () => {
    img.style.width = `${img.naturalWidth * scale}px`;
    img.style.margin = `${-title.padPx * scale}px`;
    document.documentElement.dataset.storeArt = 'ready';
  });
  return img;
}

/** Sets the page up as the camera; the match itself is started as `?autostart` starts it. */
export function installStoreArt(params: URLSearchParams): void {
  const mode = storeArtMode(params);
  if (mode === null) return;
  const root = document.documentElement;
  root.classList.add('store-art', `store-art-${mode}`);
  const style = titleStyle(params);

  if (mode === 'logo') {
    document.body.replaceChildren(titleImage(style, innerWidth));
    return;
  }

  const where = params.get('title') ?? 'center';
  if (where === 'none') {
    root.dataset.storeArt = 'ready';
    return;
  }
  const fraction = Number(params.get('titleWidth') ?? 0.6);
  const frame = document.createElement('div');
  // Behind the title: a soft veil (`shade=1`), or a band across the picture as the game's own
  // announcements run across the board (`shade=band`), or nothing.
  const shade = params.get('shade');
  frame.className = `store-title-frame at-${where}${shade === '1' ? ' shade' : shade === 'band' ? ' band' : ''}`;
  frame.append(titleImage(style, innerWidth * (Number.isFinite(fraction) ? fraction : 0.6)));
  document.body.append(frame);
}
