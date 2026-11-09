import { PRESENCE_TOKENS } from '@bollfort/config';
import { describe, expect, it } from 'vitest';

import { Presence, presenceOf, type Whereabouts } from './presence.js';

const HOST = '76561198000000001';
const at = (w: Partial<Whereabouts>): Whereabouts => ({
  place: 'match',
  tournament: false,
  round: 5,
  rounds: 10,
  group: HOST,
  size: 2,
  connect: null,
  ...w,
});

describe('Steam’s rich presence', () => {
  it('names the place and fills the round in, the table as a group', () => {
    expect(presenceOf(at({}))).toEqual({
      steam_display: '#Match',
      round: '5',
      rounds: '10',
      steam_player_group: HOST,
      steam_player_group_size: '2',
      connect: null,
      status: null,
    });
    const lobby = presenceOf(at({ place: 'lobby', connect: '+connect_lobby 1' }));
    expect(lobby).toMatchObject({
      steam_display: '#Lobby',
      round: null,
      connect: '+connect_lobby 1',
    });
  });

  it('has a token for every place, each one the files carry', () => {
    const tokens = [
      at({}),
      at({ round: 0 }),
      at({ rounds: null }),
      at({ place: 'lobby' }),
      at({ tournament: true }),
      at({ tournament: true, round: 0 }),
      at({ tournament: true, rounds: null }),
      at({ tournament: true, place: 'lobby' }),
    ].map((w) => presenceOf(w).steam_display);
    expect(new Set(tokens).size).toBe(8);
    for (const token of tokens) expect(Object.keys(PRESENCE_TOKENS)).toContain(token);
  });

  it('clears every key at the menu, and sends only on a change', () => {
    expect(Object.values(presenceOf(null)).every((v) => v === null)).toBe(true);
    const sent: unknown[] = [];
    const presence = new Presence((keys) => sent.push(keys));
    presence.set(at({}));
    presence.set(at({}));
    presence.set(at({ round: 6 }));
    presence.set(null);
    expect(sent).toHaveLength(3);
  });
});
