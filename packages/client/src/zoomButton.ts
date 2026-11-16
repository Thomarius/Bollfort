import { glyphHtml } from './glyphs.js';
import { t } from './i18n.js';
import { ICONS } from './icons.js';
import { pads } from './pads.js';

/** Its width and height, as the stylesheet sets them (`.island-zoom`). */
export const ZOOM_BUTTON_PX = 40;

/**
 * The island zoom's magnifier (`islandZoom.ts`), on the corner of the player's island: the
 * mouse's way to zoom — the wheel turns the piece — and the hint that the zoom is there at all.
 * With a controller in use it wears the glyph of the button that does the same.
 */
export class ZoomButton {
  private readonly node = document.createElement('button');
  /** What is written in it, so it is written only on a change, every frame. */
  private shown = '';

  constructor(parent: HTMLElement, press: () => void) {
    this.node.type = 'button';
    this.node.className = 'island-zoom';
    this.node.hidden = true;
    // Not the canvas's: a press here must not place the piece under it.
    this.node.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.node.addEventListener('click', press);
    parent.append(this.node);
  }

  /** Where it stands and what it offers; null hides it. */
  update(at: { x: number; y: number } | null, zoomedIn: boolean): void {
    this.node.hidden = at === null;
    if (at === null) return;
    this.node.style.left = `${Math.round(at.x - ZOOM_BUTTON_PX / 2)}px`;
    this.node.style.top = `${Math.round(at.y - ZOOM_BUTTON_PX / 2)}px`;
    const button = pads.active ? pads.bindings.zoom[0] : undefined;
    const key = `${zoomedIn}:${button ?? ''}:${pads.family}:${t('zoom.in')}`;
    if (key === this.shown) return;
    this.shown = key;
    const words = t(zoomedIn ? 'zoom.out' : 'zoom.in');
    this.node.title = words;
    this.node.setAttribute('aria-label', words);
    this.node.classList.toggle('in', zoomedIn);
    this.node.innerHTML =
      ICONS[zoomedIn ? 'zoomOut' : 'zoomIn'] +
      (button === undefined ? '' : glyphHtml(button, pads.family));
  }

  destroy(): void {
    this.node.remove();
  }
}
