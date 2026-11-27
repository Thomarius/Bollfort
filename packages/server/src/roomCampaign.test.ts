import { defaultConfigBundle } from '@bollfort/config';
import { levelSetup, newCampaign } from '@bollfort/campaign';
import {
  SnapshotSchema,
  applySnapshot,
  type CampaignSetup,
  type RecordingLine,
  type ServerMessage,
} from '@bollfort/protocol';
import { applyAction, createMatch, hashMatchState, step, type MatchState } from '@bollfort/sim';
import { describe, expect, it } from 'vitest';

import { Room, type Connection } from './room.js';

/** A page in the room: what it is told, and its own copy of the match, stepped by the commits. */
class Page implements Connection {
  readonly received: ServerMessage[] = [];
  playerId = -1;
  match: MatchState | null = null;
  /** The ticks whose hash the server sent, and whether this page's copy agreed. */
  readonly hashes: boolean[] = [];
  constructor(readonly id: string) {}
  send(message: ServerMessage): void {
    // Through the wire's own schema, as a page parses every message.
    if (message.type === 'snapshot') SnapshotSchema.parse(message.snapshot);
    this.received.push(message);
    if (message.type === 'welcome') this.playerId = message.playerId;
    if (message.type === 'snapshot') {
      const s = message.snapshot;
      const match = createMatch({
        seed: s.seed,
        ruleset: s.ruleset,
        terrainConfig: s.terrain,
        players: s.players.map((p) => ({ name: p.name, isBot: p.isBot, team: p.team })),
      });
      applySnapshot(match, s);
      this.match = match;
    }
    if (message.type === 'commit' && this.match !== null) {
      for (const action of message.actions) applyAction(this.match, action);
      step(this.match);
      this.match.events = [];
      if (message.hash !== undefined) this.hashes.push(hashMatchState(this.match) === message.hash);
    }
  }
  close(): void {}
  latest<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> {
    const message = this.received.filter((m) => m.type === type).at(-1);
    if (message === undefined) throw new Error(`no ${type} message`);
    return message as Extract<ServerMessage, { type: T }>;
  }
}

const config = defaultConfigBundle;

function room(players = 2, record?: (line: RecordingLine) => void): Room {
  return new Room({
    ...(record === undefined ? {} : { record }),
    code: 'CAMP42',
    playerCount: players,
    ruleset: config.ruleset,
    terrain: config.terrain,
    server: config.server,
    ai: config.ai,
    seed: 3,
    campaign: config.campaign,
  });
}

/** Level 1 of a new Normal campaign for these people, as the host's page sends it. */
function firstLevel(names: string[]): { setup: CampaignSetup; save: string } {
  const save = newCampaign(config.campaign, {
    id: 'c-test',
    now: '2026-11-25T12:00:00.000Z',
    difficulty: 'normal',
    names,
    seed: 99,
  });
  return { setup: levelSetup(config.campaign, save), save: JSON.stringify(save) };
}

function run(r: Room, ticks: number): void {
  const tickMs = 1000 / config.ruleset.tickRateHz;
  for (let i = 0; i < ticks && !r.finished; i++) r.update(tickMs);
}

/** A host and a guest at a two-person campaign's table, its first level sent, the guest ready. */
function seated(): { r: Room; host: Page; guest: Page } {
  const r = room();
  const host = new Page('h');
  const guest = new Page('g');
  r.join(host, 'Thomas');
  r.join(guest, 'Mausi');
  const { setup, save } = firstLevel(['Thomas', 'Mausi']);
  r.handle(host, { type: 'campaign', level: setup, save });
  r.handle(guest, { type: 'ready', ready: true });
  return { r, host, guest };
}

describe("a campaign's room (CAMPAIGN §13)", () => {
  it('records the level under its campaign, the save and the try (CA12)', () => {
    const lines: RecordingLine[] = [];
    const r = room(2, (line) => lines.push(line));
    const host = new Page('h');
    const guest = new Page('g');
    r.join(host, 'Thomas');
    r.join(guest, 'Mausi');
    const { setup, save } = firstLevel(['Thomas', 'Mausi']);
    r.handle(host, { type: 'campaign', level: setup, save });
    r.handle(guest, { type: 'ready', ready: true });
    r.handle(host, { type: 'start' });
    const header = lines[0];
    expect(header?.kind).toBe('header');
    expect(header?.kind === 'header' ? header.campaign : null).toEqual({
      id: 'c-test',
      stage: 0,
      attempt: 1,
    });
  });

  it('tells everyone the level and passes on the host’s save', () => {
    const { host, guest } = seated();
    expect(guest.latest('room').campaign?.level?.level).toBe(0);
    expect(guest.latest('room').campaign?.level?.players).toBe(2);
    expect(guest.latest('campaignSave').save).toContain('c-test');
    expect(host.latest('room').teams).toEqual([0, 0]);
  });

  it('never starts with a seat empty, and never fills one with a bot', () => {
    const r = room();
    const host = new Page('h');
    r.join(host, 'Thomas');
    const { setup, save } = firstLevel(['Thomas', 'Mausi']);
    r.handle(host, { type: 'campaign', level: setup, save });
    r.handle(host, { type: 'start' });
    expect(r.started).toBe(false);
  });

  it('turns away a level for another count of people, and a guest’s', () => {
    const r = room();
    const host = new Page('h');
    const guest = new Page('g');
    r.join(host, 'Thomas');
    r.join(guest, 'Mausi');
    const solo = firstLevel(['Thomas']);
    r.handle(host, { type: 'campaign', level: solo.setup, save: solo.save });
    expect(host.latest('room').campaign?.level).toBeNull();
    const pair = firstLevel(['Thomas', 'Mausi']);
    r.handle(guest, { type: 'campaign', level: pair.setup, save: pair.save });
    expect(host.latest('room').campaign?.level).toBeNull();
  });

  it('plays the level on one island, every page in step with the server', () => {
    const { r, host, guest } = seated();
    r.handle(host, { type: 'start' });
    expect(r.started).toBe(true);
    const snapshot = guest.latest('snapshot').snapshot;
    expect(snapshot.ruleset.campaign?.level).toBe(0);
    expect(snapshot.campaign).toBeDefined();
    expect(guest.match?.players.map((p) => p.islandId)).toEqual([1, 1]);
    // Each chooses a castle once the choice opens; the guest asks for the host's first.
    for (let i = 0; i < 600 && host.match?.phase !== 'castle_select'; i++) run(r, 1);
    expect(host.match?.phase).toBe('castle_select');
    const [first, second] = host.match!.castles;
    r.handle(host, {
      type: 'action',
      action: { kind: 'select_castle', player: 0, castleId: first!.id },
    });
    run(r, 1);
    r.handle(guest, {
      type: 'action',
      action: { kind: 'select_castle', player: 1, castleId: first!.id },
    });
    run(r, 1);
    expect(guest.latest('rejected').reason).toBe('castle_taken');
    r.handle(guest, {
      type: 'action',
      action: { kind: 'select_castle', player: 1, castleId: second!.id },
    });
    run(r, 1);
    const players = guest.match!.players;
    expect(players.map((p) => p.startingCastleId)).toEqual([first!.id, second!.id]);
    // On into the battles, the fleet arriving: every hash the server sent agreed.
    run(r, 3000);
    expect(guest.match!.campaign!.ships.length + guest.match!.campaign!.nextShipId).toBeGreaterThan(
      0,
    );
    expect(guest.hashes.length).toBeGreaterThan(50);
    expect(guest.hashes.every(Boolean)).toBe(true);
    expect(host.hashes.every(Boolean)).toBe(true);
  });

  it('gives a person who drops no bot: their seat waits, and they take it back', () => {
    const { r, host, guest } = seated();
    r.handle(host, { type: 'start' });
    r.leave(guest);
    // Well past the bots' takeover in a match of versus play.
    run(r, 1200);
    const actions = host.received.flatMap((m) => (m.type === 'commit' ? m.actions : []));
    expect(actions.filter((a) => a.player === 1 && a.kind !== 'select_castle')).toEqual([]);
    const back = new Page('g2');
    const token = guest.latest('welcome').token;
    expect(r.join(back, 'Mausi', token)).toBe(1);
    expect(back.match?.players.length).toBe(2);
    // From the snapshot taken mid-level, fleet and all, in step with the server.
    run(r, 1500);
    expect(back.hashes.length).toBeGreaterThan(20);
    expect(back.hashes.every(Boolean)).toBe(true);
  });

  it('goes back to its lobby for the next level the host sends once a level is over', () => {
    const { r, host, guest } = seated();
    r.handle(host, { type: 'start' });
    run(r, 10);
    // The level's end, however it came.
    const state = (r as unknown as { match: { state: MatchState } }).match.state;
    state.phase = 'game_over';
    expect(r.finished).toBe(true);
    r.handle(host, { type: 'rematch' });
    expect(r.finished).toBe(true);
    const next = { ...firstLevel(['Thomas', 'Mausi']).setup, level: 1, seed: 1234 };
    r.handle(host, { type: 'campaign', level: next, save: '{"next":1}' });
    expect(r.started).toBe(false);
    expect(guest.latest('room').campaign?.level?.level).toBe(1);
    expect(guest.latest('room').seed).toBe(1234);
    expect(guest.latest('campaignSave').save).toBe('{"next":1}');
    // The campaign over: no level, only the save.
    r.handle(host, { type: 'campaign', level: null, save: '{"done":1}' });
    expect(guest.latest('room').campaign?.level).toBeNull();
    expect(guest.latest('campaignSave').save).toBe('{"done":1}');
  });
});
