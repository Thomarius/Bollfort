import { ArtStyleSchema, artForStyle, defaultArtConfig, type ArtStyle } from '@bollfort/config';
import {
  applyEnclosure,
  computeEnclosure,
  stateFromAscii,
  Structure,
  type MatchState,
} from '@bollfort/sim';

import { createTheme, Scene } from './render/scene.js';
import { titleFor } from './titles.js';

/**
 * The app's icon candidates, one per style (`?icons=app&kind=castle|ring|letter|keep|bare`,
 * `&size=512`, a developer's page for `tools/storeart`, ARCHIVE 15zo): Steam's shortcut icon and
 * the desktop app's. The ideas the user chose from — the crowned main castle in a ring close up,
 * a castle and a cannon in their ring, the castle alone with its crown and without, and the
 * title's B — each drawn by the style itself, as the menu's pictures are. Minimal's B was chosen
 * (2026-11-06), the only one to read at 32 px. Every icon is opaque: Steam replaces any alpha with
 * black.
 */

/** The crowned main castle, sealed in a ring with a tile of ground round it. */
const CASTLE_BOARD = `
  ,,,,,,
  ,####,
  ,#@@#,
  ,#@@#,
  ,####,
  ,,,,,,
`;

/** A castle and a cannon in their ring: the game's core in one square. */
const RING_BOARD = `
  ,,,,,,,,
  ,######,
  ,#,,,,#,
  ,#**@@#,
  ,#**@@#,
  ,#,,,,#,
  ,######,
  ,,,,,,,,
`;

/**
 * Each idea's board, the square of it the icon shows in tiles, and whether its wall is drawn.
 * `keep` is the castle alone (the user's wish after the first round, 2026-11-06: no castle read
 * at 32 px with its walls): sealed in its ring, so its crown is whole and a style's castle alive
 * — a castle on open ground had its crown grey and broken, as an unsealed main castle's is — and
 * the ring then left undrawn. `bare` is that castle without its crown (the user's, the same day):
 * no main castle named, so none is crowned.
 */
interface Board {
  art: string;
  x: number;
  y: number;
  side: number;
  walls: boolean;
  crown: boolean;
}
const BOARDS: Record<string, Board> = {
  castle: { art: CASTLE_BOARD, x: 0, y: 0, side: 6, walls: true, crown: true },
  ring: { art: RING_BOARD, x: 0, y: 0, side: 8, walls: true, crown: true },
  keep: { art: CASTLE_BOARD, x: 1.35, y: 1.15, side: 3.3, walls: false, crown: true },
  bare: { art: CASTLE_BOARD, x: 1.35, y: 1.15, side: 3.3, walls: false, crown: false },
};

/** The same seed as the menu's pictures: clear weather and noon's light in every style. */
const SEED = 5;

function boardState(art: string, crown: boolean): MatchState {
  const state = stateFromAscii(art);
  state.seed = SEED;
  state.round = 5;
  state.phase = 'build';
  const player = state.players[0];
  if (player !== undefined) player.startingCastleId = crown ? 0 : null;
  applyEnclosure(state);
  return state;
}

async function drawBoard(style: ArtStyle, board: Board, size: number): Promise<string> {
  const canvas = document.createElement('canvas');
  const scene = new Scene();
  const look = { theme: await createTheme(style, SEED), art: artForStyle(defaultArtConfig, style) };
  try {
    await scene.init(canvas, { build: look, combat: look }, defaultArtConfig);
    const state = boardState(board.art, board.crown);
    const enclosure = computeEnclosure(state);
    // Sealed first, then the wall taken away: the castle keeps its seal, the picture its wall.
    if (!board.walls)
      for (let i = 0; i < state.structure.length; i++)
        if (state.structure[i] === Structure.Wall) state.structure[i] = Structure.Empty;
    // The whole board drawn at the size that makes the icon's square `size` pixels.
    const tile = size / board.side;
    scene.resize(state, state.width * tile, state.height * tile);
    scene.showLooks({ from: 'build', to: 'build', lineY: null });
    scene.drawTerrain(state);
    scene.drawTerritory(state, { build: enclosure.territory, combat: enclosure.territory });
    scene.drawStructures(state);
    // Long frames, as the menu's pictures take, so flags are up and anything settling settled.
    for (let k = 0; k < 12; k++) {
      scene.drawEffects(state, 0, 250, {
        build: enclosure.castleEnclosed,
        combat: enclosure.castleEnclosed,
      });
    }
    scene.render();
    const drawn = scene.app.canvas;
    const ratio = drawn.width / (state.width * tile);
    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    out
      .getContext('2d')
      ?.drawImage(
        drawn,
        board.x * tile * ratio,
        board.y * tile * ratio,
        board.side * tile * ratio,
        board.side * tile * ratio,
        0,
        0,
        size,
        size,
      );
    return out.toDataURL('image/png');
  } finally {
    // Not `destroy(true)`: see `stylePreview.ts`.
    scene.app.destroy({ removeView: true });
  }
}

/**
 * The title's first letter in the style's own lettering, on a dark ground: the B's five cells
 * and half the gap either side — a glow's padding is wider than the gap, and taken whole it
 * brought in half the O — by its seven cells and the padding and shadow above and below.
 */
async function drawLetter(style: ArtStyle, size: number): Promise<string> {
  const title = titleFor(style, defaultArtConfig);
  const img = new Image();
  img.src = title.src;
  await img.decode();
  const cell = title.cellPx;
  const sx = Math.max(0, title.padPx - cell / 2);
  const sw = title.padPx + 5.5 * cell - sx;
  const sh = 2 * title.padPx + 7 * cell + title.tailPx;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#14161d';
  g.fillRect(0, 0, size, size);
  // The letter's seven cells at seven tenths of the icon's height, its middle at the middle.
  const scale = (size * 0.7) / (7 * cell);
  const middleX = title.padPx + 2.5 * cell;
  const middleY = title.padPx + 3.5 * cell;
  g.imageSmoothingEnabled = title.smooth;
  g.drawImage(
    img,
    sx,
    0,
    sw,
    sh,
    size / 2 - (middleX - sx) * scale,
    size / 2 - middleY * scale,
    sw * scale,
    sh * scale,
  );
  return canvas.toDataURL('image/png');
}

export async function showAppIcons(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const kind = params.get('kind') ?? 'castle';
  const size = Number(params.get('size') ?? 512);
  const only = params.get('style');
  const styles = ArtStyleSchema.options.filter((s) => only === null || s === only);
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#000';
  const page = document.createElement('div');
  page.style.cssText = 'display:flex;flex-wrap:wrap';
  document.body.append(page);
  for (const style of styles) {
    const img = document.createElement('img');
    img.dataset['style'] = style;
    img.src =
      kind === 'letter'
        ? await drawLetter(style, size)
        : await drawBoard(style, BOARDS[kind] ?? BOARDS['castle']!, size);
    img.style.cssText = 'width:128px;height:128px;display:block';
    page.append(img);
  }
  page.dataset['done'] = '1';
}
