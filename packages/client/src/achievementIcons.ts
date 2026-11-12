import { ACHIEVEMENT_IDS, type AchievementId } from '@bollfort/config';

import { EMBLEMS } from './towerIcons.js';

/**
 * The Steam achievements' icons (docs/STEAM_ACHIEVEMENTS.md AC4), as SVG at Steam's 256 px:
 * one frame for all, its rim telling the difficulty — bronze, silver, gold, and steel for a stat
 * with its progress bar — and a picture of its own in the middle, built from the game's own
 * marks where one fits (the towers' emblems, the menus' trophy) on the menus' 24-unit grid.
 * Filled shapes and heavy lines, since Steam shows them at 64 px and smaller. Opaque, as Steam
 * wants; the grey icon for a locked achievement is made from the coloured one by the page
 * that renders them (`achievementSheet.ts`). Not drawn in any of the looks (§5).
 */

export type Tier = 'easy' | 'medium' | 'hard' | 'stat';

/** Each achievement's difficulty, as the list in §4 gives it. */
export const ACHIEVEMENT_TIERS: Record<AchievementId, Tier> = {
  FIRST_MATCH: 'easy',
  FIRST_WIN: 'easy',
  POCKET: 'easy',
  JUST_IN_TIME: 'easy',
  FIRST_BREACH: 'easy',
  READ_THE_MANUAL: 'easy',
  FULL_ESTATE: 'medium',
  LAND_GRAB: 'medium',
  EMPIRE: 'hard',
  SEAL_OF_APPROVAL: 'stat',
  BIG_BARRAGE: 'medium',
  LIGHTS_OUT: 'easy',
  DEMOLITION_CREW: 'stat',
  SEASONED: 'medium',
  WARLORD: 'hard',
  UNTOUCHABLE: 'hard',
  SOLE_SURVIVOR: 'hard',
  GOOD_NEIGHBOUR: 'easy',
  IN_GOOD_COMPANY: 'easy',
  SEASON_TICKET: 'easy',
  CHAMPION: 'medium',
  INVINCIBLE: 'hard',
  SPECIAL_DELIVERY: 'easy',
  ALL_TOWERS: 'stat',
  BIG_BANG: 'medium',
  HEAVYWEIGHT: 'medium',
  ARCHITECT_ZONING: 'medium',
  RAPID_FIRE: 'medium',
  CHAIN_REACTION: 'medium',
  STRAIGHT_THROUGH: 'medium',
  COLD_SHOULDER: 'medium',
  SWEET_DREAMS: 'easy',
  BASS_DROP: 'easy',
  TOWERING_VICTORY: 'medium',
  AMONG_FRIENDS: 'easy',
};

/** The rim's metal, light to dark, by tier. */
const METALS: Record<Tier, readonly [string, string, string]> = {
  easy: ['#f3c193', '#c27a43', '#6e3f1c'],
  medium: ['#ffffff', '#b9c2cc', '#5f6975'],
  hard: ['#fff1a8', '#e5b53a', '#8a5a08'],
  stat: ['#bfe6ff', '#5a9fd6', '#1f4c74'],
};

/** The picture's colours: its body, and an accent for what moves or matters. */
const INK = '#f4ead2';
const SHADE = '#c9bb98';
const FIRE = '#ff7a3d';
const GLOW = '#ffd23f';

/** A picture: SVG drawn on the 24-unit grid, centred in the frame. */
type Picture = () => string;

const rect = (x: number, y: number, w: number, h: number, fill = INK, r = 0.4): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
const line = (d: string, colour = INK, width = 2.2): string =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shape = (d: string, fill = INK): string => `<path d="${d}" fill="${fill}"/>`;

/** A tower's emblem from the board, its unit box placed at `x, y` and `size` units wide. */
function emblem(
  kind: keyof typeof EMBLEMS,
  x: number,
  y: number,
  size: number,
  fill = INK,
  outline = '',
): string {
  return EMBLEMS[kind]
    .map((poly) => {
      const points: string[] = [];
      for (let i = 0; i < poly.length; i += 2) {
        points.push(`${x + poly[i]! * size},${y + poly[i + 1]! * size}`);
      }
      const stroke =
        outline === ''
          ? ''
          : ` stroke="${outline}" stroke-width="1" stroke-linejoin="round" paint-order="stroke"`;
      return `<polygon points="${points.join(' ')}" fill="${fill}"${stroke}/>`;
    })
    .join('');
}

/** A burst of `n` points round `cx, cy`, from radius `inner` to `outer`. */
function burst(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  n: number,
  fill = FIRE,
): string {
  const points: string[] = [];
  for (let i = 0; i < n * 2; i += 1) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    points.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${points.join(' ')}" fill="${fill}"/>`;
}

/** A castle's keep, its battlements on top, `w` wide with its top left at `x, y`. */
function keep(x: number, y: number, w: number, fill = INK): string {
  const h = w * 1.05;
  const m = w / 5;
  const d =
    `M${x} ${y}h${m}v${m}h${m}v${-m}h${m}v${m}h${m}v${-m}h${m}` +
    `v${h}h${-w * 0.36}v${-h * 0.32}a${w * 0.14} ${w * 0.14} 0 0 0 ${-w * 0.28} 0v${h * 0.32}h${-w * 0.36}z`;
  return shape(d, fill);
}

/** Brick courses as filled blocks; `skip` names the bricks left out, as `row:index`. */
function bricks(
  x: number,
  y: number,
  rows: number,
  cols: number,
  skip: readonly string[] = [],
): string {
  const w = 6;
  const h = 3.2;
  const gap = 0.8;
  const out: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    const offset = r % 2 === 1;
    const width = cols * (w + gap) - gap;
    let cx = x;
    let index = 0;
    const by = y + r * (h + gap);
    while (cx < x + width - 0.01) {
      const first = offset && index === 0;
      let bw = first ? w / 2 - gap / 2 : w;
      bw = Math.min(bw, x + width - cx);
      if (!skip.includes(`${r}:${index}`)) out.push(rect(cx, by, bw, h));
      cx += bw + gap;
      index += 1;
    }
  }
  return out.join('');
}

/** The menus' trophy (`ICONS.trophy`), its cup filled. */
function trophy(fill = INK): string {
  return (
    shape('M7 3.5h10v5.5a5 5 0 0 1-10 0z', fill) +
    line('M7 5.5H4.2a3 3 0 0 0 3 4.3M17 5.5h2.8a3 3 0 0 1-3 4.3', fill, 1.8) +
    line('M12 14v4.5', fill, 2.2) +
    rect(7.5, 18.5, 9, 2.6, fill, 0.8)
  );
}

const DARK = '#0f1822';
const ICE = '#9fdcff';
const WAX = '#c8423a';

const circle = (cx: number, cy: number, r: number, fill = INK): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

/** A five-pointed star, `r` to its points. */
const star = (cx: number, cy: number, r: number, fill = GLOW): string =>
  burst(cx, cy, r * 0.45, r, 5, fill);

/** A crown, `w` wide with its top left at `x, y`, as tall as 0.7 of its width. */
function crown(x: number, y: number, w: number, fill = GLOW): string {
  const h = w * 0.7;
  return shape(
    `M${x} ${y + h}L${x} ${y + h * 0.25}L${x + w * 0.27} ${y + h * 0.58}L${x + w / 2} ${y}` +
      `L${x + w * 0.73} ${y + h * 0.58}L${x + w} ${y + h * 0.25}L${x + w} ${y + h}z`,
    fill,
  );
}

/** The awards' heart (`last-stand`), centred on `cx, cy` at `scale` of its 24-unit size. */
const heart = (cx: number, cy: number, scale: number, fill = FIRE): string =>
  `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(-12 -13.5)">` +
  shape('M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z', fill) +
  `</g>`;

/** A person, head and shoulders, the head centred on `cx, cy`. */
const person = (cx: number, cy: number, fill = INK): string =>
  circle(cx, cy, 2.8, fill) + shape(`M${cx - 5} ${cy + 11}v-2a5 5 0 0 1 10 0v2z`, fill);

/** Every achievement's picture: the type demands one for each. */
const PICTURES: Record<AchievementId, Picture> = {
  // Knock knock: a shot through the wall, bricks flying.
  FIRST_BREACH: () =>
    bricks(1.6, 5, 4, 3, ['0:1', '1:2']) +
    burst(12, 8.6, 2.6, 5.2, 7, FIRE) +
    `<circle cx="12" cy="8.6" r="2.4" fill="${INK}"/>` +
    rect(4.8, 1.2, 2, 2, SHADE) +
    rect(17.8, 0.8, 1.8, 1.8, SHADE) +
    rect(19.6, 3.4, 1.4, 1.4, SHADE),

  // Just in time: the last piece falling as the stopwatch runs out.
  JUST_IN_TIME: () =>
    `<circle cx="9.2" cy="14.4" r="6.6" fill="none" stroke="${INK}" stroke-width="2.2"/>` +
    rect(7.6, 5.2, 3.2, 1.8, INK, 0.5) +
    shape('M9.2 14.4V9.3A5.1 5.1 0 0 1 13.6 11.8z', FIRE) +
    line('M9.2 14.4V10', INK, 1.6) +
    rect(14.6, 1.8, 3.6, 3.6) +
    rect(14.6, 5.8, 3.6, 3.6) +
    rect(18.6, 5.8, 3.6, 3.6),

  // Four of a kind: all four keeps in one ring.
  FULL_ESTATE: () =>
    `<rect x="1.4" y="1.4" width="21.2" height="21.2" rx="2.4" fill="none" stroke="${GLOW}" stroke-width="1.6"/>` +
    keep(4, 4, 6.6) +
    keep(13.4, 4, 6.6) +
    keep(4, 13, 6.6) +
    keep(13.4, 13, 6.6),

  // Big bang: Big Bertha's shell, as on the board, and its blast.
  BIG_BANG: () =>
    burst(12, 12, 6.4, 11.4, 12, FIRE) +
    burst(12, 12, 4.4, 7.6, 12, GLOW) +
    emblem('bertha', 6.5, 4, 11, INK, '#0f1822'),

  // Invincible: the trophy, a shield on its cup.
  INVINCIBLE: () =>
    trophy() +
    shape('M12 4.6l3.4 1.2v2.4c0 2.1-1.5 3.4-3.4 3.9-1.9-.5-3.4-1.8-3.4-3.9V5.8z', '#5a9fd6'),

  // Demolition crew: the wrecking ball through the bricks.
  DEMOLITION_CREW: () =>
    line('M3 -0.6L8.4 9.2', SHADE, 1.4) +
    bricks(13.6, 8.6, 4, 1) +
    burst(13.4, 14, 1.8, 4.4, 6, FIRE) +
    `<circle cx="9" cy="14" r="5" fill="${INK}"/>` +
    `<circle cx="7.4" cy="12.4" r="1.4" fill="#ffffff" opacity="0.6"/>` +
    rect(19.6, 3.4, 2, 2, SHADE) +
    rect(21.6, 6.6, 1.4, 1.4, SHADE),

  // Breaking ground: the spade in the first turned earth.
  FIRST_MATCH: () =>
    rect(8.5, 1.4, 7, 2, INK, 0.8) +
    rect(11.1, 2.4, 1.8, 9.6) +
    shape('M7.6 11.4h8.8v4.4c0 2.8-2 4.8-4.4 5.8-2.4-1-4.4-3-4.4-5.8z') +
    shape('M0.6 23c3-4.4 7-6 11.4-6s8.4 1.6 11.4 6z', SHADE) +
    rect(3.4, 15.6, 1.6, 1.6, SHADE) +
    rect(19.6, 14.6, 1.4, 1.4, SHADE),

  // King of the castle: the crowned keep.
  FIRST_WIN: () => crown(6.5, 0.6, 11) + keep(6, 9, 12),

  // Pocket money: a ring of wall round no castle, and the coin it pays.
  POCKET: () =>
    `<rect x="2.6" y="2.6" width="18.8" height="18.8" rx="1.6" fill="none" stroke="${INK}" stroke-width="3.2"/>` +
    line('M2.6 9.4h1.6M19.8 14.6h1.6M9.4 2.6v1.6M14.6 19.8v1.6', DARK, 0.8) +
    circle(12, 12, 5.4, GLOW) +
    `<circle cx="12" cy="12" r="3.8" fill="none" stroke="#a87708" stroke-width="1"/>` +
    rect(11.2, 9.6, 1.6, 4.8, '#a87708'),

  // Read the manual: the open book, its bookmark.
  READ_THE_MANUAL: () =>
    shape('M12 7c-2.5-1.8-6-2.4-9.5-2v14c3.5-.4 7 .2 9.5 2z') +
    shape('M12 7c2.5-1.8 6-2.4 9.5-2v14c-3.5-.4-7 .2-9.5 2z', SHADE) +
    line(
      'M4.8 9.4c2-.2 3.6.2 5 .9M4.8 12.4c2-.2 3.6.2 5 .9M4.8 15.4c2-.2 3.6.2 5 .9' +
        'M14.2 12.4c1.4-.7 3-1.1 5-.9M14.2 15.4c1.4-.7 3-1.1 5-.9',
      DARK,
      0.9,
    ) +
    shape('M15.6 5.6v6.4l1.6-1.3 1.6 1.3V5.2z', FIRE),

  // Land grab: a flag planted on the ground taken.
  LAND_GRAB: () =>
    [0, 1, 2, 3].map((c) => rect(2 + c * 5, 13.4, 4.4, 4.2, SHADE)).join('') +
    [0, 1, 2, 3].map((c) => rect(2 + c * 5, 18.2, 4.4, 4.2, SHADE)).join('') +
    line('M12 13V1.6', INK, 1.6) +
    shape('M12.6 1.8h8l-2.2 2.8 2.2 2.8h-8z', FIRE),

  // Kingdom come: a crown over a wide realm of tiles.
  EMPIRE: () =>
    crown(6, 0.4, 12) +
    [10.2, 14.2, 18.2]
      .map((y) => [0, 1, 2, 3, 4].map((c) => rect(2 + c * 4, y, 3.4, 3.4, SHADE)).join(''))
      .join(''),

  // Seal of approval: a wax seal with a keep on it, its ribbons.
  SEAL_OF_APPROVAL: () =>
    shape('M8.4 15.6l-2.6 7.4 3-1.3 1.7 2.7 2.1-7.6z', FIRE) +
    shape('M15.6 15.6l2.6 7.4-3-1.3-1.7 2.7-2.1-7.6z', FIRE) +
    burst(12, 10.6, 7.6, 9, 14, WAX) +
    circle(12, 10.6, 6.2, '#a8322c') +
    keep(8.6, 6.8, 6.8, '#f0b0a6'),

  // Bring the house down: shots raining on one wall.
  BIG_BARRAGE: () =>
    bricks(1.6, 11, 3, 3, ['0:0', '0:2', '1:1']) +
    burst(5, 12, 2.4, 5, 7, FIRE) +
    burst(18.6, 12, 2.4, 5, 7, FIRE) +
    burst(11.8, 15.6, 2, 4.4, 7, GLOW) +
    circle(5, 4.6, 1.8) +
    circle(12, 2.2, 1.8) +
    circle(19, 5, 1.8),

  // Lights out: the candle just snuffed.
  LIGHTS_OUT: () =>
    line('M12 8.6c-1.8-1.6 1.6-2.6 0-4.3s1.4-2.6 0-4.1', SHADE, 1.3) +
    line('M12 11V9', DARK, 1.4) +
    rect(9.4, 10.6, 5.2, 10.4, INK, 0.8) +
    shape('M9.4 12.6c.8 0 .8 2.6 1.6 2.6s.6-2.6 1.4-2.6V10.6h-3z', SHADE) +
    rect(5.4, 20.4, 13.2, 2.4, SHADE, 1.2),

  // Seasoned: the salt cellar shaken, five pips for the floor's level.
  SEASONED: () =>
    `<g transform="rotate(-32 12 13)">` +
    shape('M7.5 9.4h9l1 11.6a1.6 1.6 0 0 1-1.6 1.6H8.1a1.6 1.6 0 0 1-1.6-1.6z') +
    shape('M8 6a4 4 0 0 1 8 0v3h-8z', SHADE) +
    circle(10.4, 5.6, 0.6, DARK) +
    circle(12, 4.8, 0.6, DARK) +
    circle(13.6, 5.6, 0.6, DARK) +
    [
      [10, 13],
      [14, 13],
      [12, 15.8],
      [10, 18.6],
      [14, 18.6],
    ]
      .map(([x, y]) => circle(x!, y!, 0.9, DARK))
      .join('') +
    `</g>` +
    rect(2.2, 4.4, 1.2, 1.2, INK) +
    rect(4, 1.6, 1, 1, INK) +
    rect(1.2, 1, 0.9, 0.9, INK),

  // Warlord: crossed swords under a crown.
  WARLORD: () =>
    line('M4.5 7L16 18.5', INK, 2.2) +
    line('M19.5 7L8 18.5', INK, 2.2) +
    line('M13.4 20.8l5-5M10.6 20.8l-5-5', SHADE, 2) +
    line('M17.2 19.6l3 3M6.8 19.6l-3 3', FIRE, 2.4) +
    crown(7.6, 0, 8.8),

  // Untouchable: a shield, the life behind it whole.
  UNTOUCHABLE: () =>
    shape('M12 1.6l9 3.4v6.6c0 5.6-3.9 9-9 10.2-5.1-1.2-9-4.6-9-10.2V5z') + heart(12, 11.8, 0.62),

  // Sole survivor: one keep standing, its flag up, rubble either side.
  SOLE_SURVIVOR: () =>
    line('M12 8.4V1.4', INK, 1.4) +
    shape('M12.6 1.6h5.6l-1.6 2.1 1.6 2.1h-5.6z', GLOW) +
    keep(6.2, 8.2, 11.6) +
    rect(0.4, 20.4, 23.2, 2, SHADE, 0.6) +
    rect(0.8, 17.6, 2.6, 2.6, SHADE) +
    rect(3.6, 18.4, 1.8, 1.8, SHADE) +
    rect(1.6, 15.4, 1.6, 1.6, SHADE) +
    rect(20.4, 17.4, 2.8, 2.8, SHADE) +
    rect(18.6, 18.6, 1.6, 1.6, SHADE) +
    rect(21.2, 14.8, 1.6, 1.6, SHADE),

  // Good neighbour: your brick lowered into a teammate's wall.
  GOOD_NEIGHBOUR: () =>
    bricks(1.6, 11, 3, 3, ['0:1']) +
    rect(8.4, 4.6, 6, 3.2, GLOW) +
    line('M6.4 3.8v3.4M16.4 3.8v3.4', SHADE, 1.2) +
    heart(11.4, 1.6, 0.26),

  // In good company: two keeps under one team's flag.
  IN_GOOD_COMPANY: () =>
    keep(2.4, 9, 8.4) +
    keep(13.2, 9, 8.4) +
    line('M12 18V1.6', INK, 1.4) +
    shape('M12.6 1.8h6.6l-1.8 2.4 1.8 2.4h-6.6z', GLOW) +
    rect(1.2, 18.6, 21.6, 1.8, SHADE, 0.6),

  // Season ticket: the ticket, its stub torn along the dots.
  SEASON_TICKET: () =>
    shape('M1.6 6h20.8v4a2 2 0 0 0 0 4v4H1.6v-4a2 2 0 0 0 0-4z') +
    `<path d="M16 7v10" stroke="${DARK}" stroke-width="1" stroke-dasharray="1.2 1.2"/>` +
    star(8.6, 12, 4, FIRE) +
    rect(18, 9.4, 2, 5.2, SHADE, 0.4),

  // Champion: the trophy in gold, a star on its cup.
  CHAMPION: () => trophy(GLOW) + star(12, 7.6, 2.8, INK),

  // Special delivery: a parcel, ribboned.
  SPECIAL_DELIVERY: () =>
    rect(4, 9, 16, 12.6, INK, 1) +
    rect(3, 6, 18, 3.6, SHADE, 0.8) +
    rect(10.8, 6, 2.4, 15.6, FIRE, 0) +
    shape(
      'M12 6c-2-3-5.6-3.2-5.2-.8.4 1.6 3 1.3 5.2.8zM12 6c2-3 5.6-3.2 5.2-.8-.4 1.6-3 1.3-5.2.8z',
      FIRE,
    ),

  // Tower of Babel: all nine emblems.
  ALL_TOWERS: () =>
    (Object.keys(EMBLEMS) as (keyof typeof EMBLEMS)[])
      .map((kind, i) => emblem(kind, 0.8 + (i % 3) * 8.2, 0.8 + Math.floor(i / 3) * 8.2, 6.6))
      .join(''),

  // Heavyweight: the Allerdickste Bertha's bomb, and the shockwave round it.
  HEAVYWEIGHT: () =>
    `<circle cx="12" cy="12.6" r="11" fill="none" stroke="${FIRE}" stroke-width="1" opacity="0.8"/>` +
    burst(12, 12.6, 6.6, 10.6, 16, FIRE) +
    burst(12, 12.6, 4.8, 8, 16, GLOW) +
    emblem('biggest', 4.4, 4.4, 15.6, INK, DARK),

  // Zoning laws: three Architects, their reaches apart.
  ARCHITECT_ZONING: () =>
    (
      [
        [6.2, 6.4],
        [17.8, 6.4],
        [12, 17.4],
      ] as const
    )
      .map(
        ([x, y]) =>
          `<circle cx="${x}" cy="${y}" r="5.2" fill="none" stroke="${GLOW}" stroke-width="1.2" stroke-dasharray="1.6 1.1"/>` +
          emblem('architect', x - 2.4, y - 2.4, 4.8),
      )
      .join(''),

  // Rapid fire: the Rapid Cannon's chevrons, shots streaming from them.
  RAPID_FIRE: () =>
    emblem('rapid', 6.6, 11.4, 10.8) +
    [
      [12, 8.4, 1.5],
      [12, 4.8, 1.25],
      [12, 1.6, 1],
      [7, 7.4, 1.25],
      [4.8, 4, 1],
      [17, 7.4, 1.25],
      [19.2, 4, 1],
    ]
      .map(([x, y, r]) => circle(x!, y!, r!, FIRE))
      .join(''),

  // Chain reaction: the strike jumping from wall to wall.
  CHAIN_REACTION: () =>
    emblem('lightning', 0.6, 0, 9, GLOW) +
    line('M5.8 9.2L4.4 15.2M7.2 16.6l3-3.6M14.6 13l3.4 3.4', GLOW, 1.2) +
    burst(4.4, 18.4, 2, 4.4, 6, FIRE) +
    burst(12.4, 12, 2, 4.4, 6, FIRE) +
    burst(19.6, 18.4, 2, 4.4, 6, FIRE) +
    rect(2, 16, 4.8, 4.8) +
    rect(10, 9.6, 4.8, 4.8) +
    rect(17.2, 16, 4.8, 4.8),

  // Straight through: the beam through three walls.
  STRAIGHT_THROUGH: () =>
    [5, 11, 17]
      .map((x) => rect(x, 3, 3, 7.4) + rect(x, 13.6, 3, 7.4) + rect(x + 3.4, 9.2, 1, 1, SHADE))
      .join('') +
    rect(0.4, 10, 3, 4, SHADE, 0.6) +
    line('M3 12H23.6', FIRE, 2.6) +
    line('M3 12H23.6', GLOW, 0.9),

  // Cold shoulder: a tile frozen under the Frost Cannon's snowflake.
  COLD_SHOULDER: () =>
    `<rect x="2.4" y="2.4" width="19.2" height="19.2" rx="1.6" fill="#2d6f9c" stroke="${ICE}" stroke-width="1.4"/>` +
    line('M4.6 7.4l3-3M4.6 11l6.6-6.6', ICE, 0.8) +
    emblem('frost', 4, 4, 16, '#eef9ff'),

  // Sweet dreams: the Lullaby Tower's moon, and the guns asleep.
  SWEET_DREAMS: () =>
    emblem('lullaby', 1, 6, 13.6, GLOW) +
    line('M13.6 14.4h3l-3 3.4h3', INK, 1.3) +
    line('M16.4 7.6h3.8l-3.8 4.2h3.8', INK, 1.5) +
    line('M18.4 0.6h4.4l-4.4 4.8h4.4', INK, 1.7),

  // Bass drop: the Subwoofer's wave, bricks thrown off.
  BASS_DROP: () =>
    emblem('subwoofer', 0.6, 6.6, 10.8) +
    line('M13 8a6 6 0 0 1 0 8.4M16 5.4a9.6 9.6 0 0 1 0 13.6M19 2.8a13 13 0 0 1 0 18.8', FIRE, 1.8) +
    rect(21.6, 2, 2, 2, SHADE) +
    rect(22.4, 11, 1.8, 1.8, SHADE) +
    rect(21.6, 20, 2, 2, SHADE),

  // Towering victory: three towers under the crown.
  TOWERING_VICTORY: () =>
    crown(6, 0.6, 12) +
    emblem('bertha', 1, 12, 6.6) +
    emblem('lightning', 8.7, 12, 6.6) +
    emblem('frost', 16.4, 12, 6.6) +
    rect(1, 20.4, 22, 1.6, SHADE, 0.6),

  // Among friends: two people, linked over the network.
  AMONG_FRIENDS: () =>
    person(6.8, 10, INK) +
    person(17.2, 10, SHADE) +
    line('M10 4.8a2.8 2.8 0 0 1 4 0M8.2 2.8a5.4 5.4 0 0 1 7.6 0', GLOW, 1.4) +
    circle(12, 6.6, 0.9, GLOW),
};

/** The achievements in Steam's order (§4), each with its icon. */
export const ICON_ORDER: readonly AchievementId[] = ACHIEVEMENT_IDS;

/** The rim along the frame, segmented for a stat as Steam's progress bar is. */
function rim(tier: Tier): { defs: string; body: string } {
  const [light, mid, dark] = METALS[tier];
  const gradient =
    `<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${light}"/><stop offset="0.45" stop-color="${mid}"/>` +
    `<stop offset="1" stop-color="${dark}"/></linearGradient>`;
  const ticks =
    tier === 'stat'
      ? `<rect x="15" y="15" width="226" height="226" rx="30" fill="none" stroke="#0d141c" stroke-width="15" stroke-dasharray="4 52.5" stroke-dashoffset="-26"/>`
      : '';
  return {
    defs: gradient,
    body:
      `<rect x="15" y="15" width="226" height="226" rx="30" fill="none" stroke="url(#metal)" stroke-width="14"/>` +
      ticks +
      `<rect x="23" y="23" width="210" height="210" rx="23" fill="none" stroke="${dark}" stroke-width="2" opacity="0.8"/>`,
  };
}

/** The icon of `id` as an SVG document 256 px square. */
export function achievementIcon(id: AchievementId): string {
  const picture = PICTURES[id];
  const tier = ACHIEVEMENT_TIERS[id];
  const frame = rim(tier);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<defs>${frame.defs}` +
    `<radialGradient id="field" cx="0.5" cy="0.38" r="0.75">` +
    `<stop offset="0" stop-color="#2c4058"/><stop offset="1" stop-color="#0f1822"/></radialGradient>` +
    `<filter id="lift" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000" flood-opacity="0.55"/></filter>` +
    `</defs>` +
    `<rect width="256" height="256" fill="#0b1118"/>` +
    `<rect x="8" y="8" width="240" height="240" rx="36" fill="url(#field)"/>` +
    frame.body +
    `<g filter="url(#lift)" transform="translate(53 55) scale(6.25)">${picture()}</g>` +
    `</svg>`
  );
}
