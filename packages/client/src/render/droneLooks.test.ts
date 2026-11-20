import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { BASE_DRONES } from './droneLooks.js';
import { PARKED, QUADCOPTER, type DroneLook } from './drones.js';
import { VULTURE_DRONE } from '../styles/wildwest/drone.js';

const LOOKS: readonly DroneLook[] = [
  ...new Set([...Object.values(BASE_DRONES), VULTURE_DRONE, QUADCOPTER]),
];

describe('the styles’ drones', () => {
  it('names each look’s stamps apart, so no two share a shape in the book', () => {
    expect(new Set(LOOKS.map((look) => look.key)).size).toBe(LOOKS.length);
  });

  it('draws every pose of every look, parked too, at the smallest tile and a large one', () => {
    for (const look of LOOKS) {
      const poses = [...Array.from({ length: look.frames ?? 1 }, (_, k) => k), PARKED];
      for (const tile of [8, 48]) {
        for (const pose of poses) {
          for (const layer of ['body', 'mark', 'ink'] as const) {
            const g = new Graphics();
            expect(
              () => look[layer]?.call(look, g, tile, pose),
              `${look.key} ${layer} ${pose}`,
            ).not.toThrow();
            g.destroy();
          }
        }
      }
      // Something to see in every pose: a look of nothing would be a drone gone missing.
      expect(look.body ?? look.mark ?? look.ink, look.key).toBeDefined();
    }
  });

  it('gives a look a tinted part, or the owner could not tell whose drones they are', () => {
    for (const look of LOOKS) expect(look.mark ?? look.ring?.mark, look.key).toBeDefined();
  });
});
