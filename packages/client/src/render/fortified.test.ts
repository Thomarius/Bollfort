import { defaultRuleset } from '@bollfort/config';
import { stateFromAscii, Structure, withSpecials, type MatchState, type Shot } from '@bollfort/sim';
import { describe, expect, it } from 'vitest';

import { FortifiedDisplay } from './fortified.js';

/** A 3x3 Fortified Tower (`K`, two barrels by default) in its ring, and a 2x2 (`k`). */
const BOARD = `
  ..............
  .,,,,,,,,,,,,.
  .,#####KKK,,,.
  .,#,,,,KKK,,,.
  .,#,@@,KKK,,,.
  .,#,@@,,,#,,,.
  .,#,,,,,,#,,,.
  .,##kk####,,,.
  .,,,kk,,,,,,,.
  ..............
`;

function board(): MatchState {
  return stateFromAscii(BOARD, withSpecials(defaultRuleset));
}

function shot(state: MatchState, id: number, cannonId: number): Shot {
  const tower = state.cannons.find((c) => c.id === cannonId);
  if (tower === undefined) throw new Error('no tower');
  tower.shotIds.push(id);
  const s: Shot = {
    id,
    owner: tower.owner,
    cannonId,
    kind: 'cannon',
    cost: tower.cost,
    fromX: tower.x + tower.w / 2,
    fromY: tower.y + tower.h / 2,
    toX: 12,
    toY: 2,
    launchTick: 0,
    impactTick: 30,
  } as Shot;
  state.shots.push(s);
  return s;
}

describe('a Fortified Tower as the styles draw it', () => {
  it('is wall under small ordinary guns: one on the 2x2, two side by side on the 3x3', () => {
    const state = board();
    const big = state.cannons.find((c) => c.kind === 'fortified' && c.cost === 3);
    const small = state.cannons.find((c) => c.kind === 'fortified' && c.cost === 2);
    expect(big?.barrels).toBe(2);
    const shown = new FortifiedDisplay().state(state);
    expect(shown.structure.includes(Structure.Stone)).toBe(false);
    expect(shown.structure[3 * state.width + 8]).toBe(Structure.Wall);
    // The match itself untouched.
    expect(state.structure[3 * state.width + 8]).toBe(Structure.Stone);
    const guns = shown.cannons.filter((c) => c.kind === 'cannon' && c.w === 1);
    expect(guns.map((g) => [g.x, g.y])).toEqual([
      [7 + 1 / 3, 3],
      [7 + 5 / 3, 3],
      [4.5, 7.5],
    ]);
    expect(guns[0]?.id).toBe(big?.id);
    expect(guns[2]?.id).toBe(small?.id);
    expect(new Set(shown.cannons.map((c) => c.id)).size).toBe(shown.cannons.length);
  });

  it('gives each shot its own gun, a barrel holding one, and starts it from there', () => {
    const state = board();
    const big = state.cannons.find((c) => c.cost === 3 && c.kind === 'fortified');
    if (big === undefined) throw new Error('no tower');
    const display = new FortifiedDisplay();
    const first = display.shot(shot(state, 100, big.id), state);
    const second = display.shot(shot(state, 101, big.id), state);
    expect(first.cannonId).toBe(big.id);
    expect(second.cannonId).not.toBe(big.id);
    expect(first.fromX).toBeCloseTo(7 + 1 / 3 + 0.5);
    expect(second.fromX).toBeCloseTo(7 + 5 / 3 + 0.5);
    let shown = display.state(state);
    const gun = (id: number) => shown.cannons.find((c) => c.id === id);
    expect(gun(first.cannonId)?.shotIds).toEqual([100]);
    expect(gun(second.cannonId)?.shotIds).toEqual([101]);
    // The first lands; the next shot is the first gun's again, the second still in the air.
    big.shotIds = [101];
    state.shots = state.shots.filter((s) => s.id !== 100);
    const third = display.shot(shot(state, 102, big.id), state);
    expect(third.cannonId).toBe(big.id);
    shown = display.state(state);
    expect(gun(big.id)?.shotIds).toEqual([102]);
    expect(shown.shots.find((s) => s.id === 101)?.cannonId).toBe(second.cannonId);
  });

  it('hands over the match itself where no Fortified Tower stands', () => {
    const state = stateFromAscii(BOARD.replaceAll('K', '#').replaceAll('k', '#'));
    expect(new FortifiedDisplay().state(state)).toBe(state);
  });
});
