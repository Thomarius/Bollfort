import type { Graphics } from 'pixi.js';
import type { ArtConfig, ShipKind } from '@bollfort/config';

import { hex } from './theme.js';

/**
 * How a style draws a campaign's enemy (docs/CAMPAIGN.md §14.2–§14.4), handed to the shared
 * campaign layer (`campaignMarks.ts`) as a style hands its drone to the towers' (`DroneLook`): a
 * style without one gets the plain drawing every style shares. The kinds keep their sails'
 * colours in every look (`art.campaign.sails`), so a frost ship reads as one on every board.
 */
export interface FleetLook {
  /** Names its stamps in the book, unique among the looks. */
  readonly key: string;
  /**
   * Drawn in the style's pixels, so many to a tile: placed on its pixel grid, and turned only by
   * quarter turns, a diagonal heading being drawn as a sprite of its own.
   */
  readonly pixels?: number;
  /** Multiplied over its ships and grunts: Night's darkness, which the shared layer is above. */
  readonly tint?: number;
  /** A lantern's glow at each ship's stern, by night. */
  readonly lantern?: number;
  /** Whether the style draws the fleet's shots itself, its own cannonballs. */
  readonly drawsShots?: boolean;
  /**
   * A ship centred on the origin, its bow up — or up and to the right, `diagonal` — with its sails
   * marked by the hits it has taken.
   */
  ship(
    g: Graphics,
    tile: number,
    art: ArtConfig,
    kind: ShipKind,
    hits: number,
    diagonal: boolean,
  ): void;
  /** A grunt centred on the origin, facing up; its club raised as it smashes. */
  grunt(g: Graphics, tile: number, art: ArtConfig, smashing: boolean): void;
}

/** The pixel art's colours: Medieval's woods and ropes, the grunts' iron. */
const WOOD_DARK = 0x3a2412;
const WOOD = 0x6b4a2e;
const DECK = 0xa07a50;
const DECK_LINE = 0x8a6440;
const ROPE = 0x2a1a0e;
const HOLE = 0x2a2018;
const IRON = 0x8a8e96;

/** A ship's length and beam in the style's pixels, by kind: the footprint is 32 by 32. */
const SHIP_PIXELS: Record<ShipKind, { length: number; beam: number }> = {
  raider: { length: 26, beam: 10 },
  transport: { length: 29, beam: 13 },
  frostship: { length: 31, beam: 12 },
};

/**
 * One ship rasterised a pixel at a time from its shape along the heading — hull, deck, two masts
 * with their square sails across the beam, a pennant — so the diagonal sprite is the same ship as
 * the straight one, with square pixels, where a straight sprite turned by an eighth would not be.
 */
function drawPixelShip(
  g: Graphics,
  tile: number,
  art: ArtConfig,
  kind: ShipKind,
  hits: number,
  diagonal: boolean,
): void {
  const n = 32;
  const u = tile / 16;
  const { length, beam } = SHIP_PIXELS[kind];
  const sail = hex(art.campaign.sails[kind]);
  const masts = [length * 0.22, -length * 0.2];
  const half = length / 2;
  // The hull's half-beam at a point along it: full amidships, a pointed bow, a squared stern.
  const width = (along: number): number => {
    if (along > half || along < -half) return -1;
    const bow = half - length * 0.3;
    if (along > bow) return (beam / 2) * (1 - (along - bow) / (half - bow));
    if (along < -half + 2) return beam / 2 - 1;
    return beam / 2;
  };
  const cells = new Map<number, number[]>();
  const put = (colour: number, x: number, y: number): void => {
    const list = cells.get(colour) ?? [];
    list.push(x, y);
    cells.set(colour, list);
  };
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const x = px - n / 2 + 0.5;
      const y = py - n / 2 + 0.5;
      // Into the ship's frame: `along` the heading towards the bow, `across` to starboard.
      const along = diagonal ? (x - y) / Math.SQRT2 : -y;
      const across = diagonal ? (x + y) / Math.SQRT2 : x;
      const w = width(along);
      let colour: number | null = null;
      if (w >= 0 && Math.abs(across) <= w) {
        colour = Math.abs(across) > w - 1.2 || along < -half + 1.2 ? WOOD_DARK : WOOD;
        if (Math.abs(across) <= w - 2 && along > -half + 2 && along < half - 3) {
          colour = Math.round(along) % 4 === 0 ? DECK_LINE : DECK;
        }
      }
      // The sails, square across the beam, the fore one the wider; holes where hits went through.
      for (const [m, mast] of masts.entries()) {
        const spread = beam / 2 + (m === 0 ? 2 : 3);
        if (Math.abs(along - mast) <= 1.5 && Math.abs(across) <= spread) {
          const hole = hits > 0 && holeAt(Math.round(across), m, hits, spread);
          colour = Math.abs(along - mast) > 1 ? ROPE : hole ? HOLE : sail;
        }
        if (Math.abs(along - mast) <= 0.75 && Math.abs(across) <= 0.75) colour = ROPE;
      }
      // The pennant, off the foremast's head, and the frost ship's cold bow.
      if (
        along > (masts[0] as number) + 1.5 &&
        along < (masts[0] as number) + 4 &&
        Math.abs(across) < 0.8
      ) {
        colour = sail;
      }
      if (kind === 'frostship' && along > half - 4 && w >= 0 && Math.abs(across) <= w)
        colour = 0xbfeaff;
      // The soldiers a transport carries, standing on its deck.
      if (
        kind === 'transport' &&
        Math.abs(along) < 3 &&
        Math.abs(across) < 4 &&
        (Math.round(along) + Math.round(across)) % 3 === 0
      ) {
        if (w >= 0 && Math.abs(across) <= w - 2) colour = hex(art.campaign.grunt.tunic);
      }
      if (colour !== null) put(colour, px, py);
    }
  }
  for (const [colour, list] of cells) {
    for (let k = 0; k < list.length; k += 2) {
      g.rect(((list[k] as number) - n / 2) * u, ((list[k + 1] as number) - n / 2) * u, u, u);
    }
    g.fill({ color: colour });
  }
}

/** Whether a hit has torn a hole in a sail here: a few cells a hit, the same for every ship. */
function holeAt(across: number, mast: number, hits: number, spread: number): boolean {
  for (let h = 0; h < hits; h++) {
    const at = (((h * 7 + mast * 3) % 9) - 4) * (spread / 5);
    if (Math.abs(across - Math.round(at)) <= 0.5) return true;
  }
  return false;
}

/** A grunt from above, facing up: a helmet, a red tunic, a club held out — or raised. */
const GRUNT: Readonly<Record<'stand' | 'smash', readonly string[]>> = {
  stand: [
    '..........',
    '.......c..',
    '...hhh.c..',
    '..hhhhhc..',
    '..rhhhrc..',
    '.rrrrrrr..',
    '.rrrrrr...',
    '..rrrr....',
    '..o..o....',
    '..........',
  ],
  smash: [
    '...ccc....',
    '...cc.....',
    '...hhh....',
    '..hhhhh...',
    '..rhhhr...',
    '.rrrrrrr..',
    '.rrrrrrr..',
    '..rrrr....',
    '..o..o....',
    '..........',
  ],
};

function drawPixelGrunt(g: Graphics, tile: number, art: ArtConfig, smashing: boolean): void {
  const u = tile / 16;
  const sprite = GRUNT[smashing ? 'smash' : 'stand'];
  const colours: Record<string, number> = {
    h: IRON,
    r: hex(art.campaign.grunt.tunic),
    c: hex(art.campaign.grunt.club),
    o: ROPE,
  };
  for (const [char, colour] of Object.entries(colours)) {
    let any = false;
    sprite.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== char) continue;
        g.rect((c - 5) * u, (r - 5) * u, u, u);
        any = true;
      }
    });
    if (any) g.fill({ color: colour });
  }
}

/** Medieval's fleet: pixel ships and soldiers, and its own cannonballs for their shots. */
export const MEDIEVAL_FLEET: FleetLook = {
  key: 'medieval',
  pixels: 16,
  drawsShots: true,
  ship: drawPixelShip,
  grunt: drawPixelGrunt,
};

/** Night's: the same, darkened as Night darkens its board, a lantern at each stern. */
export const NIGHT_FLEET: FleetLook = {
  ...MEDIEVAL_FLEET,
  key: 'night',
  tint: 0x8890b8,
  lantern: 0xffb048,
};
