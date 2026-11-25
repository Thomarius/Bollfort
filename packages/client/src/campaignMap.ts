import type { CampaignLevelRules } from '@bollfort/config';
import { defaultConfigBundle } from '@bollfort/config';
import { Terrain, generateCampaignTerrain } from '@bollfort/sim';

import { app } from './app.js';

/** The level's real map, small: land, sea and castles, from the seed it will be played on. */
export function drawMapPreview(rules: CampaignLevelRules, seed: number): void {
  const canvas = app!.querySelector<HTMLCanvasElement>('#campaign-map');
  const context = canvas?.getContext('2d') ?? null;
  if (canvas === undefined || canvas === null || context === null) return;
  const map = generateCampaignTerrain(rules, defaultConfigBundle.terrain, seed);
  const scale = 6;
  canvas.width = map.width * scale;
  canvas.height = map.height * scale;
  for (let i = 0; i < map.terrain.length; i++) {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    const land = map.terrain[i] === Terrain.Land;
    context.fillStyle = land ? '#6f9a4f' : map.sea[i] === 1 ? '#25507a' : '#3a6f9c';
    context.fillRect(x * scale, y * scale, scale, scale);
  }
  context.fillStyle = '#c8283c';
  for (const castle of map.castles) {
    context.fillRect(castle.x * scale, castle.y * scale, castle.w * scale, castle.h * scale);
  }
}
