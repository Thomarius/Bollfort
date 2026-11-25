import type { CampaignLevelRules, MapShape, TerrainConfig } from '@bollfort/config';

import { NEIGHBOURS_4 } from '../grid.js';
import { isqrt } from '../math.js';
import { fbm2D } from '../noise.js';
import { streamFor, type Rng } from '../rng.js';
import {
  distanceToWater,
  erode,
  largestComponent,
  placeCastles,
  TerrainGenerationError,
  thresholdForArea,
  type GeneratedCastle,
} from '../terrain.js';
import { Terrain } from '../types.js';

/**
 * A campaign level's map (docs/CAMPAIGN.md §3): one stretch of land shared by every player,
 * with open sea along one or more of the map's edges, where the fleet comes from.
 *
 * Versus play draws one island in a box and stamps it out per player, measuring the map from
 * the pattern; here the map's size is the level's, and the land is drawn on it directly — a
 * distance from the sea edges, roughened by the same noise as versus play's coastlines, cut at
 * the sea level that gives the land its share of the map.
 */

/** Which of the map's edges are open sea. */
export interface SeaEdges {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
}

/** Where a ship may appear: the top-left tile of its 2 × 2 footprint on the map's edge. */
export interface SpawnPoint {
  x: number;
  y: number;
}

export interface CampaignTerrain {
  width: number;
  height: number;
  terrain: Uint8Array;
  /** 1 for every land tile: the one island all players share (CAMPAIGN §6.1). */
  islandId: Uint8Array;
  /** 1 for water joined to the map's edge, where ships sail; 0 for land and lakes. */
  sea: Uint8Array;
  castles: GeneratedCastle[];
  edges: SeaEdges;
  /** Around the map's edge clockwise from the top left, a cyclic list (CAMPAIGN §5.2). */
  spawnPoints: SpawnPoint[];
  landArea: number;
  /** How many candidate maps were drawn before one satisfied every constraint. */
  attempts: number;
}

export type CampaignRejectReason = 'area' | 'lake' | 'castles' | 'sea';

/** Rings are kept off the map's edge by this much, where land may reach it. */
const BORDER_CLEARANCE = 1;

/** A lake's centre stands at least this far beyond its radius from sea, shore and edge. */
const LAKE_CLEARANCE = 3;

/** The sea edges of a shape, drawn from the level's seed where the shape leaves a choice. */
export function seaEdgesFor(shape: MapShape, rng: Rng): SeaEdges {
  const sides = ['north', 'east', 'south', 'west'] as const;
  const open = (...which: number[]): SeaEdges => {
    const edges: SeaEdges = { north: false, east: false, south: false, west: false };
    for (const side of which) edges[sides[side % 4] as keyof SeaEdges] = true;
    return edges;
  };
  switch (shape) {
    case 'coast':
      return open(rng.nextInt(4));
    case 'corner': {
      // A corner is a side and the next one clockwise.
      const first = rng.nextInt(4);
      return open(first, first + 1);
    }
    case 'strip':
      // Sea above and below, or left and right.
      return rng.nextInt(2) === 0 ? open(0, 2) : open(1, 3);
    case 'island':
      return open(0, 1, 2, 3);
    case 'bay':
      // Optional and later (CAMPAIGN §3.1): no level plays it yet.
      throw new TerrainGenerationError('the bay shape is not built yet');
  }
}

/**
 * Each tile's height above the sea: its distance from the nearest sea edge, the corner where
 * two sea edges meet rounded as versus play's island boxes are, plus noise. Within the margin
 * the sea is kept open (`-Infinity`, which the sea level never reaches).
 */
function buildField(
  rules: CampaignLevelRules['map'],
  edges: SeaEdges,
  config: TerrainConfig,
  seed: number,
): Float64Array {
  const { width: w, height: h, seaMarginTiles: margin } = rules;
  const field = new Float64Array(w * h);
  const { amplitudeTiles, frequency } = rules.coastNoise;
  const radius = config.island.cornerRadiusTiles;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.min(edges.west ? x : Infinity, edges.east ? w - 1 - x : Infinity);
      const dy = Math.min(edges.north ? y : Infinity, edges.south ? h - 1 - y : Infinity);
      // Exact: the arc's distance in 1/256 of a tile, by an integer square root.
      const toSea =
        dx < radius && dy < radius
          ? radius - isqrt(((radius - dx) ** 2 + (radius - dy) ** 2) * 65536) / 256
          : Math.min(dx, dy);
      if (toSea < margin) {
        field[y * w + x] = -1e9;
        continue;
      }
      const raw = fbm2D(x, y, seed, { octaves: config.island.noiseOctaves, frequency });
      field[y * w + x] = toSea + (raw - 0.5) * 2 * amplitudeTiles;
    }
  }
  return field;
}

/** Water inside the sea margin, whatever erosion did to it. */
function openMargin(mask: Uint8Array, field: Float64Array): void {
  for (let i = 0; i < mask.length; i++) if ((field[i] as number) <= -1e8) mask[i] = Terrain.Water;
}

/**
 * Cuts a lake into the land, roughly round, its centre near the middle of the land and clear of
 * every shore and the map's edge, so it never joins the sea. False when no such centre exists.
 */
function cutLake(
  mask: Uint8Array,
  w: number,
  h: number,
  radius: number,
  rng: Rng,
  seed: number,
): boolean {
  const dist = distanceToWater(mask, w, h);
  const clearance = radius + LAKE_CLEARANCE;
  let sumX = 0;
  let sumY = 0;
  let land = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== Terrain.Land) continue;
    sumX += i % w;
    sumY += Math.floor(i / w);
    land++;
  }
  if (land === 0) return false;
  // Near the land's middle, a little to one side or the other by the seed.
  const aimX = Math.floor(sumX / land) + rng.nextInt(7) - 3;
  const aimY = Math.floor(sumY / land) + rng.nextInt(7) - 3;
  let best = -1;
  let bestD2 = Infinity;
  for (let y = clearance; y < h - clearance; y++) {
    for (let x = clearance; x < w - clearance; x++) {
      const i = y * w + x;
      if (mask[i] !== Terrain.Land || (dist[i] as number) < clearance) continue;
      const d2 = (x - aimX) ** 2 + (y - aimY) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
  }
  if (best < 0) return false;
  const cx = best % w;
  const cy = Math.floor(best / w);
  const reach = radius + 2;
  for (let y = cy - reach; y <= cy + reach; y++) {
    for (let x = cx - reach; x <= cx + reach; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      // A shore a tile in or out by the noise, so it is not drawn with compasses.
      const raw = fbm2D(x, y, seed ^ 0x5a17e, { octaves: 2, frequency: 0.3 });
      const limit = radius + (raw - 0.5) * 2;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= limit * limit) mask[y * w + x] = Terrain.Water;
    }
  }
  return true;
}

/** Water joined to the map's edge, 4-connected: the sea, as against a lake. */
export function seaOf(terrain: Uint8Array, w: number, h: number): Uint8Array {
  const sea = new Uint8Array(terrain.length);
  const queue = new Int32Array(terrain.length);
  let tail = 0;
  for (let i = 0; i < terrain.length; i++) {
    const x = i % w;
    const y = (i - x) / w;
    const onEdge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    if (onEdge && terrain[i] === Terrain.Water) {
      sea[i] = 1;
      queue[tail++] = i;
    }
  }
  for (let head = 0; head < tail; head++) {
    const i = queue[head] as number;
    const x = i % w;
    const y = (i - x) / w;
    for (const [ox, oy] of NEIGHBOURS_4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (sea[ni] === 1 || terrain[ni] !== Terrain.Water) continue;
      sea[ni] = 1;
      queue[tail++] = ni;
    }
  }
  return sea;
}

/**
 * Every place on the map's edge a 2 × 2 ship fits in open sea, clockwise from the top left —
 * the top row, the right column, the bottom row backwards, the left column upwards — each once.
 */
export function spawnPointsOf(sea: Uint8Array, w: number, h: number): SpawnPoint[] {
  const points: SpawnPoint[] = [];
  const seen = new Set<number>();
  const fits = (x: number, y: number): boolean =>
    sea[y * w + x] === 1 &&
    sea[y * w + x + 1] === 1 &&
    sea[(y + 1) * w + x] === 1 &&
    sea[(y + 1) * w + x + 1] === 1;
  const visit = (x: number, y: number): void => {
    const key = y * w + x;
    if (seen.has(key) || !fits(x, y)) return;
    seen.add(key);
    points.push({ x, y });
  };
  for (let x = 0; x <= w - 2; x++) visit(x, 0);
  for (let y = 0; y <= h - 2; y++) visit(w - 2, y);
  for (let x = w - 2; x >= 0; x--) visit(x, h - 2);
  for (let y = h - 2; y >= 0; y--) visit(0, y);
  return points;
}

type Attempt =
  | { ok: true; value: Omit<CampaignTerrain, 'attempts'> }
  | { ok: false; reason: CampaignRejectReason };

function tryGenerate(
  rules: CampaignLevelRules,
  edges: SeaEdges,
  config: TerrainConfig,
  seed: number,
): Attempt {
  const map = rules.map;
  const { width: w, height: h } = map;
  const field = buildField(map, edges, config, seed);
  const target = Math.round(map.landFraction * w * h);
  const threshold = thresholdForArea(field, target);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = (field[i] as number) > threshold ? Terrain.Land : Terrain.Water;
  }

  largestComponent(mask, w, h);
  erode(mask, w, h, config.island.erosionPasses);
  openMargin(mask, field);
  // The land's share counts its lakes: measured before they are cut, or the final battle's lake
  // took most of the tolerance and its map was drawn a dozen times over.
  const drawn = largestComponent(mask, w, h);
  if (Math.abs(drawn - target) > target * config.island.areaTolerance) {
    return { ok: false, reason: 'area' };
  }

  const rng = streamFor(seed, 'lakes');
  for (let lake = 0; lake < map.lakes; lake++) {
    if (!cutLake(mask, w, h, map.lakeRadiusTiles, rng, seed)) return { ok: false, reason: 'lake' };
  }
  const area = largestComponent(mask, w, h);

  const sea = seaOf(mask, w, h);
  const spawnPoints = spawnPointsOf(sea, w, h);
  if (spawnPoints.length === 0) return { ok: false, reason: 'sea' };

  const spots = placeCastles(mask, distanceToWater(mask, w, h), w, h, config, {
    count: map.castles,
    borderClearance: BORDER_CLEARANCE,
  });
  if (spots === null) return { ok: false, reason: 'castles' };
  const [cw, ch] = config.castles.footprint;

  const islandId = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) if (mask[i] === Terrain.Land) islandId[i] = 1;
  return {
    ok: true,
    value: {
      width: w,
      height: h,
      terrain: mask,
      islandId,
      sea,
      castles: spots.map((s) => ({ islandId: 1, x: s.x, y: s.y, w: cw, h: ch })),
      edges,
      spawnPoints,
      landArea: area,
    },
  };
}

/**
 * A campaign level's map from its seed and rules. The sea edges are drawn once from the seed;
 * a candidate failing a constraint is drawn again, as versus play's maps are, and the
 * constraint that kept rejecting is named when none succeeds.
 */
export function generateCampaignTerrain(
  rules: CampaignLevelRules,
  config: TerrainConfig,
  seed: number,
): CampaignTerrain {
  const rng = streamFor(seed, 'campaign-terrain');
  const edges = seaEdgesFor(rules.shape, rng);
  const tally = new Map<CampaignRejectReason, number>();
  for (let attempt = 0; attempt < config.generation.maxRetries; attempt++) {
    const result = tryGenerate(rules, edges, config, rng.nextU32());
    if (result.ok) return { ...result.value, attempts: attempt + 1 };
    tally.set(result.reason, (tally.get(result.reason) ?? 0) + 1);
  }
  const breakdown = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason} x${count}`)
    .join(', ');
  throw new TerrainGenerationError(
    `no ${rules.shape} map of ${rules.map.width}x${rules.map.height} with ${rules.map.castles} ` +
      `castles in ${config.generation.maxRetries} attempts (seed ${seed}). Rejections: ${breakdown}`,
  );
}
