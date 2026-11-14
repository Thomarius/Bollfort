import type { ArtConfig } from '@bollfort/config';
import type { MatchState } from '@bollfort/sim';
import type { Graphics } from 'pixi.js';

import { Circling, Crossings } from '../../render/ocean.js';
import { OceanDrawn } from '../../render/seaLife.js';
import { tileX, tileY, type ViewTransform } from '../../render/theme.js';

import { WILDWEST } from './data.js';

/**
 * The Wild West: on the canyon floor far below the mesas, a stagecoach rattling across now and
 * then behind its horses' dust; vultures circling. Wood, dust and black, no player's. The
 * tumbleweeds that roll over the floor are the theme's own, with those on the mesas.
 */
export class WildWestSeaLife extends OceanDrawn {
  private readonly coaches = new Crossings();
  private readonly vultures = new Circling();

  override layout(state: MatchState, view: ViewTransform, art: ArtConfig): void {
    super.layout(state, view, art);
    this.coaches.layout(this.ocean, WILDWEST.stagecoachEveryMs);
    this.vultures.layout(this.ocean, WILDWEST.vultures, [1.5, 3]);
  }

  protected frame(g: Graphics, view: ViewTransform, _art: ArtConfig, deltaMs: number): void {
    const style = WILDWEST;
    const t = view.tile;
    const ink = Math.max(1, t * 0.05);
    const outline = 0x3a2416;
    this.coaches.step(
      this.ocean,
      deltaMs,
      style.stagecoachEveryMs,
      style.stagecoachTilesPerSecond,
      1,
    );
    for (const c of this.coaches.items) {
      if (this.behind(c.x, c.y)) continue;
      const d = c.dir;
      const bob = Math.abs(Math.sin(this.clock / 120 + c.x)) * t * 0.04;
      // Dust behind, the horses ahead, the coach on its wheels.
      for (let k = 0; k < 3; k++) {
        const p = ((this.clock / 600 + k / 3) % 1) * 1.2;
        g.circle(
          tileX(view, c.x - d * (1.0 + p)),
          tileY(view, c.y + 0.2 - p * 0.2),
          t * (0.12 + p * 0.15),
        );
        g.fill({ color: 0xf0e4c8, alpha: 0.6 * (1 - p / 1.2) });
      }
      for (const hx of [0.75, 1.15]) {
        g.ellipse(tileX(view, c.x + d * hx), tileY(view, c.y) - bob, t * 0.2, t * 0.1);
        g.moveTo(tileX(view, c.x + d * (hx + 0.15)), tileY(view, c.y) - bob);
        g.lineTo(tileX(view, c.x + d * (hx + 0.26)), tileY(view, c.y - 0.2) - bob);
      }
      g.fill({ color: 0x6a4426 });
      g.stroke({ width: Math.max(1.5, t * 0.07), color: 0x6a4426, cap: 'round' });
      g.roundRect(
        tileX(view, c.x) - t * 0.45,
        tileY(view, c.y - 0.5) - bob,
        t * 0.9,
        t * 0.5,
        t * 0.08,
      );
      g.fill({ color: 0x8a2a1e });
      g.stroke({ width: ink, color: outline });
      g.rect(tileX(view, c.x) - t * 0.2, tileY(view, c.y - 0.42) - bob, t * 0.4, t * 0.18);
      g.fill({ color: 0xe8d8b0 });
      for (const wx of [-0.3, 0.3]) {
        g.circle(tileX(view, c.x + wx), tileY(view, c.y + 0.05), t * 0.14);
        g.stroke({ width: ink, color: outline });
      }
    }
    for (const v of this.vultures.items) {
      v.angle += v.speed * (deltaMs / 1000);
      const x = tileX(view, v.cx + Math.cos(v.angle) * v.radius);
      const y = tileY(view, v.cy + Math.sin(v.angle) * v.radius * 0.6);
      const flap = Math.sin(this.clock / 300 + v.cx) * t * 0.05;
      g.moveTo(x - t * 0.42, y - flap).quadraticCurveTo(x - t * 0.18, y - t * 0.2, x, y);
      g.quadraticCurveTo(x + t * 0.18, y - t * 0.2, x + t * 0.42, y - flap);
      g.stroke({ width: Math.max(1.2, t * 0.08), color: 0x2a1c14, cap: 'round' });
    }
  }
}
