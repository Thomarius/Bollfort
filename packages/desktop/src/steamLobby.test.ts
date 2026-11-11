import { describe, expect, it } from 'vitest';

import {
  gatherLobbies,
  hereAnswer,
  type ListedLobby,
  type LobbySources,
  type Standing,
} from './steamLobby.js';

describe('the host’s answer to a guest asking where its game is', () => {
  const standing: Standing = {
    seated: true,
    started: true,
    finished: false,
    round: 3,
    maxRounds: 10,
  };

  it('names the room, the lobby, the host, and where the asker stands there (S3.6)', () => {
    const asked: string[] = [];
    const answer = hereAnswer(
      { room: 'ABCDEF', lobby: '109775240000000001' },
      (room) => {
        asked.push(room);
        return standing;
      },
      'Arnoldex',
    );
    expect(asked).toEqual(['ABCDEF']);
    expect(JSON.parse(answer!)).toEqual({
      room: 'ABCDEF',
      lobby: '109775240000000001',
      host: 'Arnoldex',
      you: standing,
    });
  });

  it('is nothing while the host hosts nothing', () => {
    expect(hereAnswer(null, () => standing, 'Arnoldex')).toBeNull();
  });
});

describe('Find a game’s lobbies under Steam (STEAM.md §4)', () => {
  const ours = { bollfort: '36', running: '0' };
  const lobbyOf = (lobby: string, owner: string, kind = 'friends') => ({
    lobby,
    owner,
    data: { ...ours, owner, kind },
  });

  /** Steam as the test sets it: the search's answer, and friends' lobbies whose data comes late. */
  function sources(
    searched: ListedLobby[],
    friends: [string, Record<string, string>][],
    arrivesAfterMs = 0,
  ) {
    let now = 0;
    const filters: Record<string, string>[] = [];
    const source: LobbySources = {
      search: async (equal) => {
        filters.push(equal);
        return searched;
      },
      friendsLobbies: () => friends.map(([lobby]) => lobby),
      data: (lobby) =>
        now >= arrivesAfterMs ? (friends.find(([id]) => id === lobby)?.[1] ?? {}) : {},
      sleep: async (ms) => {
        now += ms;
      },
    };
    return { source, filters, elapsed: () => now };
  }

  it('hands the filter to Steam’s search and lists friends’ lobbies first, each once', async () => {
    const shared = lobbyOf('2', '20', 'public');
    const { source, filters } = sources(
      [lobbyOf('1', '10', 'public'), shared],
      [
        ['3', lobbyOf('3', '30').data],
        ['2', shared.data],
      ],
    );
    const listed = await gatherLobbies(source, ours);
    expect(filters).toEqual([ours]);
    expect(listed.map((l) => [l.lobby, l.owner])).toEqual([
      ['3', '30'],
      ['2', '20'],
      ['1', '10'],
    ]);
  });

  it('waits a while for a friend’s lobby’s data, then lists without it', async () => {
    const late = sources([], [['3', lobbyOf('3', '30').data]], 500);
    expect((await gatherLobbies(late.source, ours)).map((l) => l.lobby)).toEqual(['3']);
    const never = sources([], [['3', lobbyOf('3', '30').data]], 60_000);
    expect(await gatherLobbies(never.source, ours)).toEqual([]);
    expect(never.elapsed()).toBeLessThanOrEqual(2000);
  });

  it('never lists a friend’s Invite only lobby, another game’s, or one with no owner', async () => {
    const { source } = sources(
      [],
      [
        ['3', lobbyOf('3', '30', 'invite').data],
        ['4', { ...lobbyOf('4', '40').data, bollfort: '35' }],
        ['5', { ...ours, kind: 'friends' }],
        ['6', { ...lobbyOf('6', '60').data, running: '1' }],
      ],
    );
    expect(await gatherLobbies(source, ours)).toEqual([]);
  });
});
