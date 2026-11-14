import type { ArtConfig } from '@bollfort/config';

import { DRAWN_CELL, DRAWN_PAD, drawnCanvas, wordOutline, type Title } from '../../titles.js';

/**
 * The Wild West title: the word in wood type as a poster printed it, cream on a dark brown,
 * its red second colour laid a little off register beneath, as old playbills were.
 */
export function wildwestTitle(text: string, _art: ArtConfig): Title {
  const { canvas, ctx, cells, has } = drawnCanvas(text);
  const title = { cellPx: DRAWN_CELL, padPx: DRAWN_PAD, tailPx: 0, smooth: true, flicker: false };
  if (ctx === null) return { src: canvas.toDataURL(), ...title };
  const at = (v: number): number => DRAWN_PAD + v * DRAWN_CELL;
  ctx.fillStyle = '#b4302a';
  for (const { x, y } of cells) ctx.fillRect(at(x) + 3, at(y) + 2, DRAWN_CELL, DRAWN_CELL);
  ctx.fillStyle = '#f2e6c8';
  for (const { x, y } of cells) ctx.fillRect(at(x), at(y), DRAWN_CELL, DRAWN_CELL);
  const edges = wordOutline(cells, has);
  ctx.lineCap = 'square';
  ctx.strokeStyle = '#3a2416';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of edges) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  // The wood's grain showing through the ink, a few pale nicks.
  ctx.fillStyle = '#d8c8a0';
  for (const { x, y } of cells) {
    if ((x * 7 + y * 13) % 9 !== 0) continue;
    ctx.fillRect(at(x) + 3, at(y) + 4, 4, 1);
  }
  return { src: canvas.toDataURL(), ...title };
}
