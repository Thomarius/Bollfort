import { defaultConfigBundle } from '@bollfort/config';
import { captureSnapshot } from '@bollfort/protocol';
import { createMatch, hashMatchState, step, type MatchState } from '@bollfort/sim';
import { describe, expect, it } from 'vitest';

import type { ServerConnection } from './connection.js';
import { CATCH_UP_MARGIN_TICKS, NetworkMatch } from './networkMatch.js';

const tickMs = 1000 / defaultConfigBundle.ruleset.tickRateHz;

/** The server's side: a match stepped tick by tick, each tick sent as a commit. */
function server(): { state: MatchState; commit(match: NetworkMatch): void } {
  const state = createMatch({
    seed: 3,
    ruleset: defaultConfigBundle.ruleset,
    terrainConfig: defaultConfigBundle.terrain,
    players: [
      { name: 'Ada', isBot: false },
      { name: 'Bo', isBot: false },
    ],
  });
  return {
    state,
    commit(match) {
      const tick = state.tick;
      step(state);
      match.receive({
        type: 'commit',
        tick,
        actions: [],
        ...(tick % 30 === 0 ? { hash: hashMatchState(state) } : {}),
      });
    },
  };
}

function client(host: { state: MatchState }): NetworkMatch {
  const match = new NetworkMatch({ send: () => undefined } as unknown as ServerConnection);
  match.receive({ type: 'snapshot', snapshot: captureSnapshot(host.state) });
  return match;
}

describe('a network match keeping up with the server', () => {
  it('works off the commits that arrived while the board was being built', () => {
    const host = server();
    const match = client(host);
    // About a second of commits before the first frame, as building the board takes as
    // the match opens. Under 60 ticks, this used to stay as a delay on every click.
    for (let i = 0; i < 30; i++) host.commit(match);
    expect(match.behind).toBe(30);

    match.advance(1000 / 60);
    expect(match.behind).toBeLessThanOrEqual(CATCH_UP_MARGIN_TICKS);

    // And stays caught up, one commit a tick, frames at 60 a second.
    for (let frame = 0; frame < 600; frame++) {
      if (frame % 2 === 0) host.commit(match);
      match.advance(1000 / 60);
      expect(match.behind).toBeLessThanOrEqual(CATCH_UP_MARGIN_TICKS);
    }
    expect(match.desynced).toBe(false);
    // Never past what the server confirmed.
    expect(match.state?.tick).toBeLessThanOrEqual(host.state.tick);
  });

  it('catches up after a frame too slow to count in full', () => {
    const host = server();
    const match = client(host);
    host.commit(match);
    match.advance(tickMs);
    // A frame of over a second: its time is capped, the commits are not.
    for (let i = 0; i < 40; i++) host.commit(match);
    match.advance(1200);
    expect(match.behind).toBeLessThanOrEqual(CATCH_UP_MARGIN_TICKS);
  });

  it('plays commits arriving in pairs at its own pace, not in bursts', () => {
    const host = server();
    const match = client(host);
    const stepped: number[] = [];
    for (let frame = 0; frame < 120; frame++) {
      // Two commits every 66 ms, as a network may batch them.
      if (frame % 4 === 0) {
        host.commit(match);
        host.commit(match);
      }
      const before = match.state?.tick ?? 0;
      match.advance(1000 / 60);
      stepped.push((match.state?.tick ?? 0) - before);
    }
    expect(Math.max(...stepped.slice(8))).toBe(1);
  });
});

describe('a network match out of sync', () => {
  /** A client whose connection counts its rejoins, as `rejoin` would ask the server. */
  function watched(
    host: { state: MatchState },
    limit: number,
  ): { match: NetworkMatch; rejoins: () => number } {
    let rejoins = 0;
    const connection = { send: () => undefined, rejoin: () => rejoins++ };
    const match = new NetworkMatch(connection as unknown as ServerConnection, limit);
    match.receive({ type: 'snapshot', snapshot: captureSnapshot(host.state) });
    return { match, rejoins: () => rejoins };
  }

  /** A commit whose hash cannot be the page's, as a desync's is not. */
  function wrongCommit(host: { state: MatchState }, match: NetworkMatch): void {
    const tick = host.state.tick;
    step(host.state);
    match.receive({ type: 'commit', tick, actions: [], hash: 'not-this-board' });
  }

  it('rejoins for the server’s board, holds still until it comes, then plays on from it', () => {
    const host = server();
    const { match, rejoins } = watched(host, 3);
    wrongCommit(host, match);
    match.advance(tickMs);
    expect(rejoins()).toBe(1);
    expect(match.desynced).toBe(false);
    // Held still: the commits still arriving are played on a board known to be wrong.
    const held = match.state?.tick;
    host.commit(match);
    match.advance(tickMs * 4);
    expect(match.state?.tick).toBe(held);

    // The rejoin's snapshot: the board replaced, the screen told to draw it again.
    expect(match.takeResynced()).toBe(false);
    match.receive({ type: 'snapshot', snapshot: captureSnapshot(host.state) });
    expect(match.takeResynced()).toBe(true);
    expect(match.takeResynced()).toBe(false);
    host.commit(match);
    match.advance(tickMs);
    expect(match.state?.tick).toBe(host.state.tick);
    expect(hashMatchState(match.state as MatchState)).toBe(hashMatchState(host.state));
  });

  it('stops rejoining past its limit, and says it is out of sync', () => {
    const host = server();
    const { match, rejoins } = watched(host, 1);
    wrongCommit(host, match);
    match.advance(tickMs);
    match.receive({ type: 'snapshot', snapshot: captureSnapshot(host.state) });
    wrongCommit(host, match);
    match.advance(tickMs);
    expect(rejoins()).toBe(1);
    expect(match.desynced).toBe(true);
  });
});
