import type { PadAction } from './gamepad.js';
import { escape } from './html.js';

/**
 * Button glyphs (STEAM.md §8, package C4): a text that says what the mouse does says, while a
 * controller is in use, which button does it — the button bound, drawn as the pad prints it:
 * Xbox's (and the Deck's) lettered buttons by default, PlayStation's shapes when the pad says
 * it is one.
 */

export type PadFamily = 'xbox' | 'playstation';

/**
 * The family a pad's name gives away. Chromium names a pad by its product and its USB IDs;
 * Sony's vendor ID is 054c. Anything else, Steam Input's virtual pad on the Deck among them,
 * is laid out as an Xbox pad.
 */
export function padFamily(id: string): PadFamily {
  return /054c|playstation|dualshock|dualsense/i.test(id) ? 'playstation' : 'xbox';
}

/** The standard mapping's buttons 0–11 as each family prints them. */
const LABELS: Readonly<Record<PadFamily, readonly string[]>> = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS'],
  playstation: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3'],
};

export function glyphLabel(button: number, family: PadFamily): string {
  return LABELS[family][button] ?? `#${button}`;
}

/** A button drawn as a key: round for the four face buttons, a pill for the rest. */
export function glyphHtml(button: number, family: PadFamily): string {
  const shape = button <= 3 ? 'face' : 'pill';
  return `<span class="glyph ${family} ${shape} b${button}">${escape(glyphLabel(button, family))}</span>`;
}

/** Stand for the glyphs in a text until it is escaped: private-use characters, in no locale. */
const MARKS = { accept: '\u{E000}', turn: '\u{E001}', menu: '\u{E002}' } as const;

/**
 * A text with `{accept}`, `{turn}` or `{menu}` in it as HTML: the text escaped, and in each
 * place the glyph of the button bound to that action.
 */
export function withGlyphs(
  text: (marks: Readonly<Record<PadAction, string>>) => string,
  bindings: Readonly<Record<PadAction, readonly number[]>>,
  family: PadFamily,
): string {
  let html = escape(text(MARKS));
  for (const action of ['accept', 'turn', 'menu'] as const) {
    const button = bindings[action][0];
    html = html.split(MARKS[action]).join(button === undefined ? '' : glyphHtml(button, family));
  }
  return html;
}
