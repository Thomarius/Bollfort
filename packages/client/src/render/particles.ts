import { Container, Sprite, Texture } from 'pixi.js';

/**
 * Small filled shapes many times a frame — smoke, chunks, embers — as sprites of one white disc
 * or square, placed, sized, tinted and faded: four vertices each. Drawn as shapes, Medieval's
 * particles were most of a `Graphics` cut into triangles every frame; stamped as shared shapes
 * (`Stamps`) the cutting went but the render did not get faster, since Pixi still copies every
 * vertex of every stamp into its batch each frame, some thirty a disc, and the placing cost more
 * than the drawing had (2026-11-13). As sprites they cost what four-vertex quads cost.
 *
 * Placed afresh each frame in the order placed, as `Stamps` are: `begin`, a `disc` or `rect`
 * per shape, `end`. Later ones lie over earlier ones, as later shapes in one `Graphics` did.
 */
export class Particles {
  readonly container = new Container();
  private readonly sprites: Sprite[] = [];
  private used = 0;

  begin(): void {
    this.used = 0;
  }

  /** A filled ellipse centred on (`x`, `y`), as `circle` or `ellipse` and `fill` drew one. */
  disc(x: number, y: number, rx: number, ry: number, tint: number, alpha: number): void {
    const sprite = this.take(discTexture());
    sprite.anchor.set(0.5);
    this.put(sprite, x, y, rx * 2, ry * 2, tint, alpha);
  }

  /** A filled rectangle from (`x`, `y`), as `rect` and `fill` drew one. */
  rect(x: number, y: number, w: number, h: number, tint: number, alpha: number): void {
    const sprite = this.take(Texture.WHITE);
    sprite.anchor.set(0);
    this.put(sprite, x, y, w, h, tint, alpha);
  }

  /** Hides what was placed last frame and not this one. */
  end(): void {
    for (let i = this.used; i < this.sprites.length; i++)
      (this.sprites[i] as Sprite).visible = false;
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
    this.container.destroy();
  }

  private take(texture: Texture): Sprite {
    let sprite = this.sprites[this.used];
    if (sprite === undefined) {
      sprite = new Sprite(texture);
      this.sprites.push(sprite);
      this.container.addChild(sprite);
    } else if (sprite.texture !== texture) {
      sprite.texture = texture;
    }
    this.used++;
    return sprite;
  }

  private put(
    sprite: Sprite,
    x: number,
    y: number,
    w: number,
    h: number,
    tint: number,
    alpha: number,
  ): void {
    sprite.visible = true;
    sprite.position.set(x, y);
    sprite.width = w;
    sprite.height = h;
    sprite.tint = tint;
    sprite.alpha = alpha;
  }
}

/** Pixels across the disc's texture: enough that a smoke puff at its largest shows no steps. */
const DISC_PX = 64;

let disc: Texture | null = null;

/**
 * A white disc with a hard edge, sampled nearest: the renderer draws without antialiasing, so
 * a circle drawn as a shape had a hard edge too, and a soft one would read as another look.
 * Made once for the page, as `Texture.WHITE` is, and never destroyed.
 */
function discTexture(): Texture {
  if (disc !== null) return disc;
  const canvas = document.createElement('canvas');
  canvas.width = DISC_PX;
  canvas.height = DISC_PX;
  const context = canvas.getContext('2d');
  if (context === null) return Texture.WHITE;
  const image = context.createImageData(DISC_PX, DISC_PX);
  const r = DISC_PX / 2;
  for (let y = 0; y < DISC_PX; y++) {
    for (let x = 0; x < DISC_PX; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      if (dx * dx + dy * dy > r * r) continue;
      const i = (y * DISC_PX + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  disc = Texture.from(canvas);
  disc.source.scaleMode = 'nearest';
  return disc;
}
