import type { Graphics } from 'pixi.js';

/*
 * Opera's things, drawn by its theme, its sea life and its finish alike: notes, a rest, a
 * lyre, a rose thrown at a curtain call and a swan.
 */

/** Gold leaf, as on every box and cornice of the house. */
export const GOLD = 0xe8c25a;
const GOLD_DARK = 0x9a7a2a;

/**
 * A note: a head tilted as engraving tilts it, a stem, and `flags` flags — 0 a crotchet, 1 a
 * quaver, 2 a semiquaver. (x, y) is the head; `size` its stem's length in pixels; `angle`
 * rocks the whole note.
 */
export function drawQuaver(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  colour: number,
  alpha = 1,
  flags = 1,
  angle = 0,
): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (u: number, v: number): [number, number] => [
    x + (c * u - s * v) * size,
    y + (s * u + c * v) * size,
  ];
  // The head, as a rotated ellipse traced in points so it turns with the note.
  const head: number[] = [];
  for (let n = 0; n < 12; n++) {
    const a = (n / 12) * Math.PI * 2;
    const u = Math.cos(a) * 0.3;
    const v = Math.sin(a) * 0.2;
    head.push(...at(u * 0.94 - v * 0.34, u * 0.34 + v * 0.94));
  }
  g.poly(head);
  g.fill({ color: colour, alpha });
  g.moveTo(...at(0.27, -0.05)).lineTo(...at(0.27, -1));
  for (let k = 0; k < flags; k++) {
    const top = -1 + k * 0.25;
    g.moveTo(...at(0.27, top));
    g.quadraticCurveTo(...at(0.6, top + 0.2), ...at(0.55, top + 0.55));
  }
  g.stroke({ width: Math.max(1, size * 0.1), color: colour, alpha, cap: 'round' });
}

/**
 * A treble clef, its middle at (x, y), `size` its height in pixels: the curl at its head,
 * the stem falling through the spiral round the G line, and the hook and dot at its foot —
 * one stroke, as an engraver's hand would draw it.
 */
export function drawTrebleClef(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  colour: number,
  alpha = 1,
): void {
  const h = size;
  const at = (u: number, v: number): [number, number] => [x + u * h, y + v * h];
  // The spiral round the G line, out from its eye, then up and over into the head's curl.
  g.moveTo(...at(0.03, 0.12));
  g.bezierCurveTo(...at(0.2, 0.11), ...at(0.2, -0.1), ...at(0.01, -0.1));
  g.bezierCurveTo(...at(-0.24, -0.1), ...at(-0.26, 0.25), ...at(0.03, 0.25));
  g.bezierCurveTo(...at(0.3, 0.25), ...at(0.3, -0.06), ...at(0.08, -0.17));
  g.bezierCurveTo(...at(-0.1, -0.27), ...at(-0.1, -0.42), ...at(0.0, -0.48));
  g.bezierCurveTo(...at(0.08, -0.53), ...at(0.13, -0.45), ...at(0.06, -0.37));
  // The stem, down through the spiral to the foot's hook.
  g.lineTo(...at(-0.01, 0.38));
  g.bezierCurveTo(...at(-0.02, 0.5), ...at(-0.17, 0.5), ...at(-0.16, 0.41));
  g.stroke({ width: Math.max(1, h * 0.07), color: colour, alpha, cap: 'round', join: 'round' });
  g.circle(...at(-0.12, 0.41), h * 0.055);
  g.fill({ color: colour, alpha });
}

/** A crotchet rest: the zigzag of silence. (x, y) its middle, `size` its height. */
export function drawRest(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  colour: number,
  alpha: number,
): void {
  const s = size;
  g.moveTo(x - s * 0.1, y - s * 0.5)
    .lineTo(x + s * 0.15, y - s * 0.22)
    .lineTo(x - s * 0.12, y + s * 0.02)
    .lineTo(x + s * 0.14, y + s * 0.26);
  g.quadraticCurveTo(x - s * 0.2, y + s * 0.12, x - s * 0.02, y + s * 0.5);
  g.stroke({ width: Math.max(1.5, s * 0.14), color: colour, alpha, cap: 'round', join: 'round' });
}

/** A lyre: two curved arms on a base, a crossbar and its strings, in gold. */
export function drawLyre(g: Graphics, x: number, y: number, size: number, alpha = 1): void {
  const s = size;
  for (const side of [-1, 1]) {
    g.moveTo(x + side * s * 0.12, y + s * 0.45);
    g.bezierCurveTo(
      x + side * s * 0.55,
      y + s * 0.3,
      x + side * s * 0.1,
      y - s * 0.2,
      x + side * s * 0.38,
      y - s * 0.5,
    );
  }
  g.moveTo(x - s * 0.34, y - s * 0.36).lineTo(x + s * 0.34, y - s * 0.36);
  g.moveTo(x - s * 0.18, y + s * 0.45).lineTo(x + s * 0.18, y + s * 0.45);
  g.stroke({ width: Math.max(1.5, s * 0.12), color: GOLD, alpha, cap: 'round' });
  for (const dx of [-0.1, 0, 0.1])
    g.moveTo(x + dx * s, y - s * 0.36).lineTo(x + dx * s, y + s * 0.42);
  g.stroke({ width: 1, color: GOLD_DARK, alpha });
}

/** A rose thrown at a curtain call: a red bloom wound round itself on a green stem. */
export function drawRose(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  angle: number,
  alpha: number,
  bloom = 0xc8203c,
): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  g.moveTo(x, y).lineTo(x + c * size * 1.4, y + s * size * 1.4);
  g.stroke({ width: Math.max(1, size * 0.22), color: 0x2f7a2c, alpha, cap: 'round' });
  g.moveTo(x + c * size * 0.8, y + s * size * 0.8).lineTo(
    x + c * size * 0.8 - s * size * 0.35,
    y + s * size * 0.8 + c * size * 0.35,
  );
  g.stroke({ width: Math.max(1, size * 0.18), color: 0x2f7a2c, alpha, cap: 'round' });
  g.circle(x, y, size * 0.55);
  g.fill({ color: bloom, alpha });
  g.moveTo(x - size * 0.25, y);
  g.arc(x, y, size * 0.25, Math.PI, Math.PI * 2.6);
  g.stroke({ width: Math.max(1, size * 0.12), color: 0x7a1024, alpha });
}

/** A swan gliding, `dir` the way it faces: body, folded wing, the S of its neck, a beak. */
export function drawSwan(g: Graphics, x: number, y: number, size: number, dir: 1 | -1): void {
  const s = size;
  g.ellipse(x, y + s * 0.42, s * 0.75, s * 0.12);
  g.fill({ color: 0xffffff, alpha: 0.25 });
  g.moveTo(x - dir * s * 0.6, y + s * 0.05);
  g.quadraticCurveTo(x - dir * s * 0.75, y - s * 0.35, x - dir * s * 0.35, y - s * 0.15);
  g.quadraticCurveTo(x + dir * s * 0.2, y + s * 0.0, x + dir * s * 0.45, y + s * 0.05);
  g.quadraticCurveTo(x + dir * s * 0.3, y + s * 0.4, x - dir * s * 0.1, y + s * 0.38);
  g.quadraticCurveTo(x - dir * s * 0.5, y + s * 0.35, x - dir * s * 0.6, y + s * 0.05);
  g.fill({ color: 0xfbfbf6 });
  g.moveTo(x + dir * s * 0.35, y + s * 0.05);
  g.bezierCurveTo(
    x + dir * s * 0.65,
    y - s * 0.2,
    x + dir * s * 0.2,
    y - s * 0.55,
    x + dir * s * 0.45,
    y - s * 0.75,
  );
  g.stroke({ width: Math.max(1.5, s * 0.12), color: 0xfbfbf6, cap: 'round' });
  g.moveTo(x + dir * s * 0.45, y - s * 0.75).lineTo(x + dir * s * 0.62, y - s * 0.7);
  g.stroke({ width: Math.max(1, s * 0.08), color: 0xf08a24, cap: 'round' });
}
