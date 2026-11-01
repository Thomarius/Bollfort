import { stateFromAscii } from '@bollwerk/sim';
import { describe, expect, it } from 'vitest';

import { leakCells } from './leak.js';

describe('the leak shown as a round is lost', () => {
  it('is the tile the tightest wall still lacked', () => {
    const state = stateFromAscii(`
      ..........
      .,,,,,,,,.
      .,######,.
      .,#,,,,#,.
      .,#,@@,#,.
      .,#,@@,,,.
      .,#,,,,#,.
      .,######,.
      .,,,,,,,,.
      ..........
    `);
    // The ring's east side open at (7, 5), mid-edge, so the flood gets out.
    expect(leakCells(state, 0)).toEqual([{ x: 7, y: 5 }]);
  });

  it('is nothing for a wall already whole', () => {
    const state = stateFromAscii(`
      ..........
      .,,,,,,,,.
      .,######,.
      .,#,,,,#,.
      .,#,@@,#,.
      .,#,@@,#,.
      .,#,,,,#,.
      .,######,.
      .,,,,,,,,.
      ..........
    `);
    expect(leakCells(state, 0)).toEqual([]);
  });
});
