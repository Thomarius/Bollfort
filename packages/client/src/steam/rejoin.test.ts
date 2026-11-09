import { describe, expect, it } from 'vitest';

import { joinRoute, readHostAnswer, stillPlaying } from './rejoin.js';

const HOST = '76561198000000001';
const OTHER = '76561198000000009';
const LOBBY = '109775240000000001';
const kept = { host: HOST, room: 'ABCDEF', at: 0 };

describe('an invite or Join, taken (S3.6)', () => {
  it('goes straight back to the host of the match left, no lobby on the way', () => {
    expect(joinRoute({ lobby: LOBBY, from: HOST }, kept, null)).toEqual({
      kind: 'back',
      host: HOST,
    });
  });

  it('is no news from the host whose table the page is at', () => {
    expect(joinRoute({ lobby: LOBBY, from: HOST }, kept, HOST)).toEqual({ kind: 'here' });
  });

  it('goes through the lobby otherwise: someone else, no match kept, or nobody named', () => {
    const lobby = { kind: 'lobby', lobby: LOBBY };
    expect(joinRoute({ lobby: LOBBY, from: OTHER }, kept, null)).toEqual(lobby);
    expect(joinRoute({ lobby: LOBBY, from: HOST }, null, null)).toEqual(lobby);
    // A game started by the invite hears no inviter.
    expect(joinRoute({ lobby: LOBBY, from: null }, kept, null)).toEqual(lobby);
  });
});

describe('the host’s answer', () => {
  const you = { seated: true, started: true, finished: false, round: 4, maxRounds: 10 };

  it('offers the match while it runs with the asker’s seat in it', () => {
    const answer = readHostAnswer({ room: 'ABCDEF', lobby: LOBBY, host: 'Bo', you });
    expect(answer).toEqual({ room: 'ABCDEF', lobby: LOBBY, host: 'Bo', you });
    expect(stillPlaying(answer)).toBe(true);
  });

  it('offers nothing once it is over, before it, without the seat, or with no room', () => {
    const read = (y: object | null, room: unknown = 'ABCDEF') =>
      stillPlaying(readHostAnswer({ room, lobby: null, host: 'Bo', you: y }));
    expect(read({ ...you, finished: true })).toBe(false);
    expect(read({ ...you, started: false })).toBe(false);
    expect(read({ ...you, seated: false })).toBe(false);
    expect(read(you, null)).toBe(false);
    expect(read(null)).toBe(false);
    expect(stillPlaying(readHostAnswer(null))).toBe(false);
  });

  it('is read defensively, as it comes over the network', () => {
    expect(readHostAnswer('nonsense')).toBeNull();
    const garbled = readHostAnswer({
      room: 7,
      lobby: {},
      host: 'x'.repeat(100),
      you: { seated: 'yes' },
    });
    expect(garbled).toEqual({ room: null, lobby: null, host: null, you: null });
    // An older host's answer, with no standing: no prompt.
    expect(readHostAnswer({ room: 'ABCDEF', lobby: LOBBY })?.you).toBeNull();
  });
});
