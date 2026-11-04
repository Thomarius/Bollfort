import { defaultArtConfig } from '@bollfort/config';

import { Repeater, heading, nearestBoxInDirection, pointBox, type Vec } from './gamepad.js';
import type { Pads } from './pads.js';

/**
 * The menus with a controller (STEAM.md §8, package C2): focus moved between the controls on
 * screen in the direction pushed, Accept pressing the focused one, Back the window's Back or
 * Close. One walker for every window, so no window needs code of its own:
 *
 * - **What can be focused** is what the mouse could click: a button, a link, a slider or a
 *   list, enabled, and the topmost thing at its own centre — so a window over another takes
 *   the focus, and the one beneath is out of reach, as it is to the mouse. A control scrolled
 *   out of its list counts if the list itself is reachable, and is scrolled into view.
 * - **Choices in sight** (`choices.ts`) take left and right to change — a row's next option, a
 *   switch off and on, a slider a twentieth — and up and down to leave; pushed on past the
 *   last option, the focus leaves that way too, so a window's other column is in reach. A
 *   stepper is its − and + buttons, pressed with Accept: two steppers share a row, and left
 *   and right must reach both.
 * - **Back** presses the window's own way back, marked `data-back` (Close, Done, Leave, Back),
 *   nearest the focus, and with none it is Esc, which closes the pause menu and the demo.
 * - **Where focus starts**: with none, or the focused control gone, the control last pressed
 *   if it is back in reach — a window closing returns to what opened it — else the window's
 *   main button (`.primary`, `[data-main]`), else the first in reading order.
 *
 * The focus is ringed by the class `pad-focus`, not `:focus-visible`, which Chromium gives a
 * script's focus only after a key.
 */

/** Everything the pad can focus, before asking whether it is in reach. */
const FOCUSABLE = [
  'button',
  'a[href]',
  'summary',
  'input[type="range"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'select:not(.replaced)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** How long a window's main button is looked for after the walker chose a focus itself. */
const ENTRY_MS = 500;

/** How long a focused control drawn afresh is waited for before the focus starts over. */
const REDRAW_GRACE_MS = 300;

/** A window's way back, nearest the focus first. */
const BACK = '[data-back]';

/** The window's main button, focused as it opens. */
const MAIN = '[data-main], .primary';

const centre = (r: DOMRect): Vec => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** The nearest ancestor that scrolls, or null. */
function scroller(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
    const { overflowY, overflowX } = getComputedStyle(p);
    if (
      /(auto|scroll)/.test(overflowY + overflowX) &&
      (p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth)
    )
      return p;
  }
  return null;
}

/** Whether a point is on screen and the topmost thing there is `el` or inside it. */
function topmostAt(el: Element, at: Vec): boolean {
  if (at.x < 0 || at.y < 0 || at.x >= innerWidth || at.y >= innerHeight) return false;
  const hit = document.elementFromPoint(at.x, at.y);
  return hit !== null && (hit === el || el.contains(hit));
}

/** Whether the mouse could click it now: shown, enabled, and on top. */
export function reachable(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled === true) return false;
  if (el.closest('[hidden], [inert], .replaced') !== null) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  if (topmostAt(el, centre(rect))) return true;
  // Scrolled out of its list: in reach if the list is, inside the list's own box.
  const list = scroller(el);
  if (list === null) return false;
  const box = list.getBoundingClientRect();
  const c = centre(rect);
  const inside = c.x >= box.left && c.x < box.right && c.y >= box.top && c.y < box.bottom;
  return !inside && topmostAt(list, centre(box));
}

function candidates(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.closest('#app canvas') === null && reachable(el),
  );
}

/** In the corner's row of buttons, which stands under every screen. */
const inCorner = (el: Element): boolean => el.closest('#corner') !== null;

/** How many ancestors two elements share: the nearer they are in the page, the more. */
function shared(a: Element, b: Element): number {
  const chain = new Set<Element>();
  for (let p: Element | null = a; p !== null; p = p.parentElement) chain.add(p);
  let depth = 0;
  for (let p: Element | null = b; p !== null; p = p.parentElement) if (chain.has(p)) depth++;
  return depth;
}

export class PadMenus {
  private readonly repeater = new Repeater(defaultArtConfig.gamepad);
  private focused: HTMLElement | null = null;
  /**
   * The focus was put in the corner's row (Sound, Full screen, Pause, Demo) for want of
   * anything else, not by the player: it moves to the window that appears, as a loading
   * screen gives way to the lobby.
   */
  private waiting = false;
  /**
   * When the walker last chose the focus itself, short of a window's main button: a window
   * fades in, and its main button may come in reach a frame or two after the rest.
   */
  private choseAt: number | null = null;
  /** Whether `start` last fell back to the first control in reading order. */
  private fellBack = false;
  /** Where the focus last stood, to find its successor when its window is drawn afresh. */
  private lastBox: DOMRect | null = null;
  /** When the focused control left the page, for the grace its window has to be redrawn. */
  private goneAt: number | null = null;
  /** The controls pressed, latest last: where focus goes back to as a window closes. */
  private readonly openers: { el: HTMLElement; box: DOMRect }[] = [];

  constructor(private readonly pads: Pads) {
    // A click or a key elsewhere moves the real focus; the ring follows only the pad's.
    pads.onChange((inUse) => {
      if (!inUse) this.ring(null);
    });
  }

  /** One frame of the menus, unless the match's board has the pad this frame. */
  update(elapsedMs: number): void {
    const reading = this.pads.last;
    if (reading === null || !this.pads.active) {
      this.repeater.reset();
      return;
    }
    const { dir, strength } = heading(reading);
    const steps = this.repeater.update(dir, strength, elapsedMs);
    const moved = steps.x !== 0 || steps.y !== 0;
    const accept = this.pads.pressedNow('accept');
    const back = this.pads.pressedNow('turn');
    const now = performance.now();
    if (this.choseAt !== null && now - this.choseAt < ENTRY_MS && this.focused !== null) {
      const main = candidates().find((el) => el.matches(MAIN) && !inCorner(el));
      if (main !== undefined && main !== this.focused) {
        this.ring(main);
        this.choseAt = null;
      }
    }
    if (this.waiting && this.focused !== null) {
      const better = this.start();
      if (better !== null && better !== undefined && !inCorner(better)) this.ring(better);
    }
    if (this.focused !== null && this.focused.isConnected)
      this.lastBox = this.focused.getBoundingClientRect();
    if (!moved && !accept && !back && this.focused !== null && reachable(this.focused)) return;

    // The focus lost — never set, its window closed, covered — is found again first.
    let focus = this.focused !== null && reachable(this.focused) ? this.focused : null;
    if (focus === null) {
      const found = this.start();
      // A window being drawn afresh, fading in: its successor is looked for again next frame.
      if (found === undefined) return;
      focus = found;
      this.ring(focus);
      this.choseAt = this.fellBack ? now : null;
      // The press that found the focus does nothing more, so a pad picked up acts on sight.
      if (!back) return;
    }

    if (back) {
      this.back(focus);
      return;
    }
    if (moved && focus !== null) {
      const step = { x: Math.sign(steps.x), y: Math.sign(steps.y) };
      if (step.x !== 0 && step.y === 0 && this.change(focus, step.x)) return;
      this.move(focus, step);
    }
    if (accept && focus !== null) {
      this.waiting = false;
      this.choseAt = null;
      this.openers.push({ el: focus, box: focus.getBoundingClientRect() });
      if (this.openers.length > 16) this.openers.shift();
      focus.click();
    }
  }

  /** Where focus starts: what was pressed last, back in reach, or the window's main button. */
  private start(): HTMLElement | null | undefined {
    this.fellBack = false;
    // A stepper's + at its limit, disabled under the focus: the nearest control takes it.
    const stale = this.focused;
    if (stale !== null && stale.isConnected && (stale as HTMLButtonElement).disabled === true) {
      const best = this.near(stale.getBoundingClientRect(), Infinity);
      if (best !== null) return best;
    }
    // Drawn afresh — the lobby redraws itself at every change — the control now where the
    // focused one stood is its successor.
    if (this.focused !== null && !this.focused.isConnected && this.lastBox !== null) {
      const best = this.near(this.lastBox, 40);
      if (best !== null) {
        this.goneAt = null;
        return best;
      }
      // Faded in from nothing, a redrawn window's controls are out of reach for a frame or two.
      const now = performance.now();
      this.goneAt ??= now;
      if (now - this.goneAt < REDRAW_GRACE_MS) return undefined;
    }
    this.goneAt = null;
    // Newest first. One covered by the window it opened is kept for when that closes; one
    // gone from the page is dropped, and so is everything pressed after the one returned to.
    // One drawn afresh since — the lobby redraws as the tower menu it opened closes — is
    // found again where it stood.
    for (let i = this.openers.length - 1; i >= 0; i--) {
      const { el, box } = this.openers[i]!;
      const found = el.isConnected ? (reachable(el) ? el : null) : this.near(box, 40);
      if (found !== null) {
        this.openers.length = i;
        this.openers.push({ el: found, box: found.getBoundingClientRect() });
        return found;
      }
    }
    // The corner's row only when nothing else is on screen.
    const everything = candidates();
    const windows = everything.filter((el) => !inCorner(el));
    const all = windows.length > 0 ? windows : everything;
    const main = all.find((el) => el.matches(MAIN));
    if (main !== undefined) return main;
    this.fellBack = true;
    return (
      [...all].sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return Math.abs(ra.top - rb.top) > 8 ? ra.top - rb.top : ra.left - rb.left;
      })[0] ?? null
    );
  }

  /** The control in reach nearest a box's centre, within `within` pixels, or null. */
  private near(box: DOMRect, within: number): HTMLElement | null {
    const was = centre(box);
    let best: HTMLElement | null = null;
    let nearest = within;
    for (const el of candidates()) {
      const at = centre(el.getBoundingClientRect());
      const d = Math.hypot(at.x - was.x, at.y - was.y);
      if (d < nearest) {
        nearest = d;
        best = el;
      }
    }
    return best;
  }

  private ring(target: HTMLElement | null): void {
    // Into a row of options, on the one chosen: left and right change it from there.
    const row = target?.closest('.ui-choice.seg');
    const el = row?.querySelector<HTMLElement>('button.on') ?? target;
    if (this.focused !== el) this.focused?.classList.remove('pad-focus');
    this.focused = el;
    this.waiting = el !== null && inCorner(el);
    if (el === null) return;
    el.classList.add('pad-focus');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** To the nearest control the way pushed, leaving a choice's own buttons behind. */
  private move(from: HTMLElement, dir: Vec): void {
    const group = from.closest('.ui-choice.seg, .ui-choice.switch');
    const source = group ?? from;
    const own = source.getBoundingClientRect();
    const items = candidates()
      .filter((el) => el !== from && (group === null || !group.contains(el)))
      .map((el) => {
        const box = el.getBoundingClientRect();
        // A heart inside its look's card, and the card round it: centre to centre, and the
        // card's own heart before anything outside it, and the card first back from its heart.
        const nested = source.contains(el) || el.contains(source);
        return nested
          ? { box: pointBox(box), item: el, from: pointBox(own), first: true }
          : { box, item: el };
      });
    const next = nearestBoxInDirection(own, items, dir);
    if (next !== null) {
      this.ring(next);
      this.waiting = false;
      this.choseAt = null;
    }
  }

  /**
   * Left or right on a choice, a slider or a list: changed, as its buttons or the mouse would
   * change it. False when the focus is none of them, for the push to move the focus instead.
   */
  private change(el: HTMLElement, by: number): boolean {
    const group = el.closest<HTMLElement>('.ui-choice.seg, .ui-choice.switch');
    if (group !== null) {
      const buttons = [...group.querySelectorAll<HTMLButtonElement>('button')];
      if (group.classList.contains('seg')) {
        const at = buttons.findIndex((b) => b.classList.contains('on'));
        const next = buttons[at + by];
        if (next === undefined || next.disabled) return false;
        next.click();
        this.ring(next);
        return true;
      }
      const toggle = buttons[0];
      if (toggle === undefined || toggle.disabled || toggle.classList.contains('on') === by > 0)
        return false;
      toggle.click();
      return true;
    }
    if (el instanceof HTMLInputElement && el.type === 'range') {
      const min = Number(el.min || 0);
      const max = Number(el.max || 100);
      const value = Math.max(min, Math.min(max, Number(el.value) + (by * (max - min)) / 20));
      if (value === Number(el.value)) return false;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (el instanceof HTMLSelectElement) {
      const index = el.selectedIndex + by;
      if (index < 0 || index >= el.options.length) return false;
      el.selectedIndex = index;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  /** The window's way back nearest the focus, or Esc where it has none. */
  private back(focus: HTMLElement | null): void {
    const backs = [...document.querySelectorAll<HTMLElement>(BACK)].filter(reachable);
    let best: HTMLElement | null = null;
    let depth = -1;
    for (const b of backs) {
      const d = focus === null ? 0 : shared(focus, b);
      if (d > depth) {
        depth = d;
        best = b;
      }
    }
    if (best !== null) {
      best.click();
      return;
    }
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
  }
}
