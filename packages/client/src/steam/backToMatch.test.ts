import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KEPT_FOR_MS, forgetMatch, keepMatch, keptMatch } from './backToMatch.js';

const HOST = '76561198005395758';

describe('the match kept for Back to the match', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is the host and room, until forgotten', () => {
    keepMatch(HOST, 'ABCDEF', 1000);
    expect(keptMatch(2000)).toEqual({ host: HOST, room: 'ABCDEF', at: 1000 });
    forgetMatch();
    expect(keptMatch(2000)).toBeNull();
  });

  it('is none once older than any match runs', () => {
    keepMatch(HOST, 'ABCDEF', 0);
    expect(keptMatch(KEPT_FOR_MS)).not.toBeNull();
    expect(keptMatch(KEPT_FOR_MS + 1)).toBeNull();
  });

  it('is none when what is stored is not one', () => {
    localStorage.setItem('bollfort.steamMatch', '{"host":"x","room":"ABCDEF","at":1}');
    expect(keptMatch(2)).toBeNull();
    localStorage.setItem('bollfort.steamMatch', 'not json');
    expect(keptMatch(2)).toBeNull();
  });
});
