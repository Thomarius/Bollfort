import { DEFAULT_BINDINGS, type PadAction } from './gamepad.js';
import { glyphHtml } from './glyphs.js';
import { escape } from './html.js';
import { t } from './i18n.js';
import { enhanceChoices } from './choices.js';
import {
  CURSOR_SPEEDS,
  PAD_ACTIONS,
  parseCursorSpeed,
  rebind,
  saveBindings,
  saveCursorSpeed,
  storedBindings,
  storedCursorSpeed,
  type CursorSpeed,
} from './padSettings.js';
import { pads } from './pads.js';

/**
 * The controller's settings (STEAM.md §8, package C3), a window of their own opened from the
 * settings column's Controller row, in Options and the pause menu alike: five rows in the
 * column would have made the pause menu taller than the Deck's 800 pixels.
 *
 * Choose an action, then press the button for it on the pad: the next button pressed is
 * taken (`pads.capture`), whatever it would otherwise do. A button another action had swaps
 * with this action's old one (`rebind`), so every action keeps one. The wait ends at a press,
 * a second click, the window closing, or after a few seconds.
 */

/** How long the window waits for the button to bind. */
const LISTEN_MS = 6000;

const ACTION_TEXTS = {
  accept: { name: 'controller.accept', tip: 'controller.acceptTitle' },
  turn: { name: 'controller.turn', tip: 'controller.turnTitle' },
  menu: { name: 'controller.menu', tip: 'controller.menuTitle' },
} as const;

export function openController(click: () => void): void {
  const root = document.createElement('div');
  root.className = 'how-to-play options controller';
  let listening: { action: PadAction; until: ReturnType<typeof setTimeout> } | null = null;

  const stopListening = (): void => {
    if (listening !== null) clearTimeout(listening.until);
    listening = null;
    pads.capture = null;
  };

  const close = (): void => {
    click();
    stopListening();
    root.remove();
  };

  /** The rows as the bindings stand, rebuilt at every change: they are few. */
  const fill = (): void => {
    const bindings = storedBindings();
    const rows = PAD_ACTIONS.map((action) => {
      const waiting = listening?.action === action;
      const button = bindings[action][0];
      const shown = waiting
        ? t('controller.press')
        : button === undefined
          ? '—'
          : glyphHtml(button, pads.family);
      return (
        `<label data-tip="${escape(t(ACTION_TEXTS[action].tip))}">${t(ACTION_TEXTS[action].name)}` +
        ` <button type="button" class="bind${waiting ? ' waiting' : ''}" data-action="${action}">${shown}</button></label>`
      );
    }).join('');
    const speeds = (Object.keys(CURSOR_SPEEDS) as CursorSpeed[])
      .map((s) => `<option value="${s}">${escape(t(`cursorSpeed.${s}`))}</option>`)
      .join('');
    root.innerHTML = `
      <div class="panel">
        <h2>${t('controller.title')}</h2>
        <p class="note">${t(pads.connected ? 'controller.hint' : 'controller.none')}</p>
        <div class="settings-rows">
          ${rows}
          <label data-tip="${escape(t('controller.cursorTitle'))}">${t('controller.cursor')} <select class="cursor-speed" data-ui="seg">${speeds}</select></label>
        </div>
        <button type="button" class="restore quiet">${t('controller.restore')}</button>
        <button class="close quiet" data-back>${t('credits.close')}</button>
      </div>`;
    const speed = root.querySelector<HTMLSelectElement>('.cursor-speed')!;
    speed.value = storedCursorSpeed();
    speed.addEventListener('change', () => {
      click();
      saveCursorSpeed(parseCursorSpeed(speed.value) ?? 'normal');
    });
    enhanceChoices(root);
    // The walker rests while a button is awaited, so its ring is put on the row here.
    if (pads.active) root.querySelector('.bind.waiting')?.classList.add('pad-focus');
    for (const bind of root.querySelectorAll<HTMLButtonElement>('.bind')) {
      bind.addEventListener('click', () => listen(bind.dataset.action as PadAction));
    }
    root.querySelector('.restore')?.addEventListener('click', () => {
      click();
      stopListening();
      saveBindings(DEFAULT_BINDINGS);
      pads.bindings = DEFAULT_BINDINGS;
      saveCursorSpeed('normal');
      fill();
    });
    root.querySelector('.close')?.addEventListener('click', close);
  };

  const listen = (action: PadAction): void => {
    click();
    // A second click on the row waiting gives up.
    const again = listening?.action === action;
    stopListening();
    if (!again) {
      listening = {
        action,
        until: setTimeout(() => {
          stopListening();
          fill();
        }, LISTEN_MS),
      };
      pads.capture = (button) => {
        const next = rebind(storedBindings(), action, button);
        // The d-pad, or anything else no action may take: still waiting.
        if (next === storedBindings()) return;
        saveBindings(next);
        pads.bindings = next;
        stopListening();
        click();
        fill();
      };
    }
    fill();
  };

  fill();
  document.body.append(root);
  // A click on the dimmed screen around the panel closes it, as Options' does.
  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });
}
