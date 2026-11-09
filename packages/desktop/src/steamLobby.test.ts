import { describe, expect, it } from 'vitest';

import { hereAnswer, type Standing } from './steamLobby.js';

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
