import { defaultConfigBundle } from '@bollfort/config';

import { escape } from './html.js';
import { t } from './i18n.js';

/**
 * An on-screen keyboard for a controller (STEAM.md §8, package C5): the name and the room code
 * were the only things a pad could not reach. Accept on a focused text field opens it
 * (`padMenus.ts`); its keys are buttons the focus walker walks like any others, Accept types,
 * Back is Done. What is typed goes into the field as it is typed, as a keyboard's would.
 *
 * Valve's Deck review asks for exactly this: a game needing text opens a keyboard itself, or
 * has its own entry a controller alone can use, in the player's language — so the letters a
 * German name needs are on it.
 *
 * Two layouts: a room code's, its alphabet only (`rooms.codeAlphabet`: no lookalikes, capitals
 * and figures), and a name's, letters with Shift, figures, a few marks and Space.
 */

export type KeyboardKind = 'code' | 'text';

/** A key: a character to type, or one of the keyboard's own. */
export type Key = string | { special: 'shift' | 'space' | 'delete' | 'done' };

const CODE_COLUMNS = 8;

/** The keys, row by row, for a field of this kind. */
export function keyboardRows(kind: KeyboardKind, alphabet: string): Key[][] {
  if (kind === 'code') {
    const rows: Key[][] = [];
    const chars = [...alphabet];
    for (let i = 0; i < chars.length; i += CODE_COLUMNS)
      rows.push(chars.slice(i, i + CODE_COLUMNS));
    rows.push([{ special: 'delete' }, { special: 'done' }]);
    return rows;
  }
  return [
    [...'1234567890'],
    [...'qwertzuiop'],
    [...'asdfghjklß'],
    [...'yxcvbnmäöü'],
    [...".-'_!?&éèç"],
    [{ special: 'shift' }, { special: 'space' }, { special: 'delete' }, { special: 'done' }],
  ];
}

/**
 * The field's value after a key: a character added at the end, as long as `max` allows, in
 * capitals while Shift is on; the last character taken off by Delete. A room code is in
 * capitals whatever is pressed.
 */
export function typeKey(
  value: string,
  key: Key,
  options: { max: number; shift: boolean; kind: KeyboardKind },
): string {
  if (typeof key === 'string') {
    if ([...value].length >= options.max) return value;
    const char = options.kind === 'code' || options.shift ? key.toUpperCase() : key;
    // ß has no capital a name would want.
    return value + (key === 'ß' ? 'ß' : char);
  }
  if (key.special === 'space') {
    if ([...value].length >= options.max || value.length === 0 || value.endsWith(' ')) return value;
    return `${value} `;
  }
  if (key.special === 'delete') return [...value].slice(0, -1).join('');
  return value;
}

/** Whether Shift should be on: at the start of a name and of each word, as a phone's is. */
export function shiftFor(value: string): boolean {
  return value.length === 0 || value.endsWith(' ');
}

/** What a field is called, for the keyboard's heading: its label, else its own name. */
function fieldName(input: HTMLInputElement): string {
  const label = input.closest('label');
  const own =
    label === null
      ? ''
      : [...label.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('')
          .trim();
  return own || input.getAttribute('aria-label') || input.placeholder || '';
}

/** Opens the keyboard over the page for `input`; it closes on Done, Back or a click outside. */
export function openKeyboard(input: HTMLInputElement, click: () => void): void {
  const kind: KeyboardKind = input.id === 'code' ? 'code' : 'text';
  const max = input.maxLength > 0 ? input.maxLength : 16;
  const rows = keyboardRows(kind, defaultConfigBundle.server.rooms.codeAlphabet);
  let shift = kind === 'text' && shiftFor(input.value);

  const root = document.createElement('div');
  root.className = `how-to-play keyboard ${kind}`;
  const label = (key: Key): string => {
    if (typeof key === 'string')
      return escape(kind === 'text' && shift && key !== 'ß' ? key.toUpperCase() : key);
    return escape(t(`keyboard.${key.special}`));
  };
  const keyHtml = (key: Key, row: number, col: number): string => {
    const special = typeof key === 'string' ? '' : ` ${key.special}`;
    const on = typeof key !== 'string' && key.special === 'shift' && shift ? ' on' : '';
    // The first character is where the focus starts; Done is the way back.
    const marks =
      (row === 0 && col === 0 ? ' data-main' : '') +
      (typeof key !== 'string' && key.special === 'done' ? ' data-back' : '');
    return `<button type="button" class="key${special}${on}" data-row="${row}" data-col="${col}"${marks}>${label(key)}</button>`;
  };

  const fill = (): void => {
    root.innerHTML =
      `<div class="panel">` +
      `<h2>${escape(kind === 'code' ? t('keyboard.roomCode') : fieldName(input))}</h2>` +
      `<output class="typed">${escape(input.value)}<i class="caret"></i></output>` +
      `<div class="keys">${rows
        .map(
          (row, r) => `<div class="row">${row.map((key, c) => keyHtml(key, r, c)).join('')}</div>`,
        )
        .join('')}</div>` +
      `</div>`;
  };

  const close = (): void => {
    root.remove();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  root.addEventListener('click', (event) => {
    if (event.target === root) {
      close();
      return;
    }
    const button = (event.target as Element).closest<HTMLButtonElement>('button.key');
    if (button === null) return;
    const key = rows[Number(button.dataset.row)]?.[Number(button.dataset.col)];
    if (key === undefined) return;
    click();
    if (typeof key !== 'string' && key.special === 'done') {
      close();
      return;
    }
    if (typeof key !== 'string' && key.special === 'shift') {
      shift = !shift;
    } else {
      const next = typeKey(input.value, key, { max, shift, kind });
      if (next !== input.value) {
        input.value = next;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (kind === 'text') shift = shiftFor(next);
    }
    // Drawn afresh, the focus walker finds the same key where it stood.
    fill();
  });

  fill();
  document.body.append(root);
}
