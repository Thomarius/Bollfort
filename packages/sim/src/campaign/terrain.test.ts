import { describe, expect, it } from 'vitest';
import { defaultTerrainConfig, type CampaignLevelRules, type MapShape } from '@bollfort/config';

import { streamFor } from '../rng.js';
import { campaignLevelRuleset } from '../testing.js';
import { TerrainGenerationError } from '../terrain.js';
import { Terrain } from '../types.js';
import { generateCampaignTerrain, seaEdgesFor, seaOf, spawnPointsOf } from './terrain.js';

const SIZES = [
  { width: 44, height: 32 },
  { width: 56, height: 36 },
  { width: 66, height: 40 },
];

/** The castles of the level each shape is first played at (CAMPAIGN §3.4), two more a player. */
const CASTLES: Record<MapShape, number> = { coast: 6, corner: 5, strip: 5, island: 2, bay: 5 };

function rules(shape: MapShape, players = 1, lakes = 0): CampaignLevelRules {
  const base = campaignLevelRuleset().campaign as CampaignLevelRules;
  const size = SIZES[players - 1] as (typeof SIZES)[number];
  return {
    ...base,
    shape,
    map: {
      ...base.map,
      width: size.width,
      height: size.height,
      castles: CASTLES[shape] + 2 * (players - 1),
      landFraction: shape === 'island' ? 0.42 : shape === 'coast' ? 0.6 : 0.5,
      lakes,
    },
  };
}

const SHAPES: readonly MapShape[] = ['coast', 'corner', 'strip', 'island'];

/** Land tiles 4-connected to the first one, which is all of them on a one-piece map. */
function landReached(terrain: Uint8Array, w: number): number {
  const start = terrain.indexOf(Terrain.Land);
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const i = queue.pop() as number;
    const x = i % w;
    for (const n of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
      if (n < 0 || n >= terrain.length || seen.has(n) || terrain[n] !== Terrain.Land) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen.size;
}

describe('generateCampaignTerrain', () => {
  for (const shape of SHAPES) {
    for (const players of [1, 2, 3]) {
      it(`makes a ${shape} map for ${players} player(s) that keeps every rule`, () => {
        const level = rules(shape, players, shape === 'island' ? 1 : 0);
        for (let seed = 0; seed < 6; seed++) {
          const map = generateCampaignTerrain(level, defaultTerrainConfig, seed);
          const { width: w, height: h } = map;
          expect([w, h]).toEqual([level.map.width, level.map.height]);

          // One piece of land, all of it the shared island.
          const land = map.terrain.reduce((n, t) => n + (t === Terrain.Land ? 1 : 0), 0);
          expect(landReached(map.terrain, w)).toBe(land);
          for (let i = 0; i < w * h; i++) {
            expect(map.islandId[i]).toBe(map.terrain[i] === Terrain.Land ? 1 : 0);
          }

          // Open sea along every sea edge, the margin's width.
          const margin = level.map.seaMarginTiles;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const nearSea =
                (map.edges.north && y < margin) ||
                (map.edges.south && y >= h - margin) ||
                (map.edges.west && x < margin) ||
                (map.edges.east && x >= w - margin);
              if (nearSea) expect(map.sea[y * w + x]).toBe(1);
            }
          }

          // Every castle, its ring with it, on land and clear of the map's edge.
          expect(map.castles).toHaveLength(level.map.castles);
          const ring = defaultTerrainConfig.startingWall.ringRadiusTiles;
          for (const c of map.castles) {
            expect(c.islandId).toBe(1);
            for (let y = c.y - ring; y < c.y + c.h + ring; y++) {
              for (let x = c.x - ring; x < c.x + c.w + ring; x++) {
                expect(x > 0 && y > 0 && x < w - 1 && y < h - 1).toBe(true);
                expect(map.terrain[y * w + x]).toBe(Terrain.Land);
              }
            }
          }

          // Ships appear on the edge, in open sea.
          expect(map.spawnPoints.length).toBeGreaterThan(0);
          for (const p of map.spawnPoints) {
            expect(p.x === 0 || p.y === 0 || p.x === w - 2 || p.y === h - 2).toBe(true);
            for (const i of [0, 1, w, w + 1]) expect(map.sea[p.y * w + p.x + i]).toBe(1);
          }
        }
      });
    }
  }

  it('opens the sea on the edges the shape asks for', () => {
    const count = (shape: MapShape, seed: number): number =>
      Object.values(seaEdgesFor(shape, streamFor(seed, 'edges'))).filter(Boolean).length;
    for (let seed = 0; seed < 20; seed++) {
      expect(count('coast', seed)).toBe(1);
      expect(count('corner', seed)).toBe(2);
      expect(count('strip', seed)).toBe(2);
      expect(count('island', seed)).toBe(4);
      const corner = seaEdgesFor('corner', streamFor(seed, 'edges'));
      const strip = seaEdgesFor('strip', streamFor(seed, 'edges'));
      // A corner's two seas meet; a strip's face each other.
      expect(corner.north !== corner.south && corner.east !== corner.west).toBe(true);
      expect(strip.north === strip.south && strip.east === strip.west).toBe(true);
    }
    expect(() => seaEdgesFor('bay', streamFor(1, 'edges'))).toThrow(TerrainGenerationError);
  });

  it('varies with the seed and repeats with it', () => {
    // "Fits" and "varies" are different questions (CLAUDE.md): a map pinned by its frame
    // generates fine and is the same for every seed.
    for (const shape of SHAPES) {
      const maps = Array.from({ length: 8 }, (_, seed) =>
        generateCampaignTerrain(rules(shape), defaultTerrainConfig, seed).terrain.join(''),
      );
      expect(new Set(maps).size).toBe(maps.length);
      const again = generateCampaignTerrain(rules(shape), defaultTerrainConfig, 3);
      expect(again.terrain.join('')).toBe(maps[3]);
    }
  });

  it('cuts a lake into the land, which is not sea', () => {
    const map = generateCampaignTerrain(rules('island', 1, 1), defaultTerrainConfig, 5);
    const lake = map.terrain.filter((t, i) => t === Terrain.Water && map.sea[i] === 0).length;
    expect(lake).toBeGreaterThan(20);
    expect(map.castles).toHaveLength(2);
  });

  it('tells sea from a lake, and finds the edge places a ship fits', () => {
    const art = ['....,,', '....,,', ',,,,,,', ',,..,,', ',,..,,', ',,,,,,'];
    const w = 6;
    const terrain = new Uint8Array(
      art.flatMap((row) => [...row].map((c) => (c === '.' ? Terrain.Water : Terrain.Land))),
    );
    const sea = seaOf(terrain, w, art.length);
    expect(sea[0]).toBe(1);
    expect(sea[3 * w + 2]).toBe(0);
    // The top left 4 × 2 of sea: three places along the top, the left column's only that one.
    expect(spawnPointsOf(sea, w, art.length)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });
});
