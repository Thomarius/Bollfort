import { defaultConfigBundle } from '@bollfort/config';
import { describe, expect, it } from 'vitest';

import { keyboardRows, shiftFor, typeKey } from './padKeyboard.js';

const alphabet = defaultConfigBundle.server.rooms.codeAlphabet;
const text = { max: 16, shift: false, kind: 'text' as const };

describe('the on-screen keyboard', () => {
  it("offers a room code's alphabet and nothing else, and a name's letters, figures and marks", () => {
    const code = keyboardRows('code', alphabet)
      .flat()
      .filter((k) => typeof k === 'string');
    expect(code.join('')).toBe(alphabet);
    const name = keyboardRows('text', alphabet).flat();
    for (const char of ['a', 'z', 'ä', 'ö', 'ü', 'ß', 'é', '0', '-']) expect(name).toContain(char);
    expect(name).toContainEqual({ special: 'shift' });
    expect(name).toContainEqual({ special: 'space' });
  });

  it('types a character at the end, in capitals with Shift, and never past the field’s length', () => {
    expect(typeKey('Bo', 'b', text)).toBe('Bob');
    expect(typeKey('', 'b', { ...text, shift: true })).toBe('B');
    expect(typeKey('', 'ß', { ...text, shift: true })).toBe('ß');
    expect(typeKey('abcd', 'e', { ...text, max: 4 })).toBe('abcd');
  });

  it('types a room code in capitals, whatever is pressed', () => {
    expect(typeKey('AB', 'k', { max: 8, shift: false, kind: 'code' })).toBe('ABK');
  });

  it('deletes the last character, and takes no space at the start or twice', () => {
    expect(typeKey('Bö', { special: 'delete' }, text)).toBe('B');
    expect(typeKey('', { special: 'delete' }, text)).toBe('');
    expect(typeKey('', { special: 'space' }, text)).toBe('');
    expect(typeKey('Bo ', { special: 'space' }, text)).toBe('Bo ');
    expect(typeKey('Bo', { special: 'space' }, text)).toBe('Bo ');
  });

  it('puts Shift on at the start of a name and of each word, as a phone does', () => {
    expect(shiftFor('')).toBe(true);
    expect(shiftFor('Anna ')).toBe(true);
    expect(shiftFor('Anna')).toBe(false);
  });
});
