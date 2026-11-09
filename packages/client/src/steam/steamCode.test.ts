import { describe, expect, it } from 'vitest';

import { STEAM_CODE_LENGTH, steamCodeOf, steamIdOfCode } from './steamCode.js';

describe('a Steam code', () => {
  it('is seven letters, a server room code’s six plus one', () => {
    expect(STEAM_CODE_LENGTH).toBe(7);
  });

  it('names its host’s Steam ID and back, typed in any case', () => {
    for (const id of ['76561198005395758', '76561197960265728', '76561202255233023']) {
      const code = steamCodeOf(id);
      expect(code).toHaveLength(7);
      expect(steamIdOfCode(code!)).toBe(id);
      expect(steamIdOfCode(` ${code!.toLowerCase()} `)).toBe(id);
    }
  });

  it('is none for what is no person’s account, nor any other text', () => {
    expect(steamCodeOf('109775240000000000')).toBeNull(); // a lobby's ID
    expect(steamCodeOf('12')).toBeNull();
    expect(steamCodeOf('not a number')).toBeNull();
    expect(steamIdOfCode('ABCDEF')).toBeNull(); // a server's room code
    expect(steamIdOfCode('ABCDEF1')).toBeNull(); // 1 is not a letter of codes
    expect(steamIdOfCode('9999999')).toBeNull(); // past 32 bits
  });
});
