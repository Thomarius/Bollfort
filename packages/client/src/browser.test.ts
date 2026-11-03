import { PROTOCOL_VERSION, type RoomListing } from '@bollfort/protocol';
import { describe, expect, it } from 'vitest';

import {
  NO_FILTERS,
  filterRooms,
  gamesMarkup,
  joinRefusedNotice,
  parseFilters,
  parseRoomList,
} from './browser.js';

const room: RoomListing = {
  code: 'ABCD',
  host: 'Ada',
  people: 1,
  playerCount: 3,
  teamSize: 1,
  towers: false,
  tournament: null,
};

describe('the open games browser', () => {
  it('reads a server’s list of open rooms', () => {
    expect(parseRoomList({ protocol: PROTOCOL_VERSION, rooms: [room] })).toEqual([room]);
  });

  it('shows no browser without a server, or for one this page cannot join', () => {
    // Under the dev server any path answers with the page itself, not JSON.
    expect(parseRoomList(undefined)).toBeNull();
    expect(parseRoomList('<!doctype html>')).toBeNull();
    expect(parseRoomList({ protocol: PROTOCOL_VERSION - 1, rooms: [room] })).toBeNull();
  });

  it('lists each room with its host, mode, free seats and towers, and a Join for its code', () => {
    const html = gamesMarkup([
      room,
      { ...room, code: 'WXYZ', host: 'Bo', teamSize: 2, playerCount: 4, towers: true },
    ]);
    expect(html).toContain('Ada');
    expect(html).toContain('free-for-all · 2 of 3 seats free · no special towers');
    expect(html).toContain('teams of 2 · 3 of 4 seats free · special towers');
    expect(html).toContain('data-code="ABCD"');
    expect(html).toContain('data-code="WXYZ"');
  });

  it('escapes names, which come from other players', () => {
    expect(gamesMarkup([{ ...room, host: '<b>x</b>' }])).not.toContain('<b>x</b>');
  });

  it('with no open games, offers to host a public single match', () => {
    const html = gamesMarkup([]);
    expect(html).toContain('No open games');
    expect(html).toContain('id="host-public"');
    expect(html).toContain('Host a single match');
  });

  it('says when the filters, not the server, leave the list empty', () => {
    const html = gamesMarkup([room], { mode: 'teams', towers: 'any' });
    expect(html).toContain('No open games match these filters');
    expect(html).toContain('id="host-public"');
  });

  it('explains a room that filled, closed or removed this browser, and nothing else', () => {
    expect(joinRefusedNotice('room_full')).toMatch(/filled up/);
    expect(joinRefusedNotice('no_room')).toMatch(/closed/);
    expect(joinRefusedNotice('removed')).toMatch(/removed you/);
    expect(joinRefusedNotice('no_capacity')).toBeNull();
  });
});

describe('the browser’s filters', () => {
  const ffa = room;
  const teams = { ...room, code: 'T', teamSize: 2, playerCount: 4 };
  const towers = { ...room, code: 'W', towers: true };
  const all = [ffa, teams, towers];

  it('lets everything through by default', () => {
    expect(filterRooms(all, NO_FILTERS)).toEqual(all);
  });

  it('keeps free-for-all or teams, towers on or off, and both together', () => {
    expect(filterRooms(all, { mode: 'ffa', towers: 'any' })).toEqual([ffa, towers]);
    expect(filterRooms(all, { mode: 'teams', towers: 'any' })).toEqual([teams]);
    expect(filterRooms(all, { mode: 'any', towers: 'on' })).toEqual([towers]);
    expect(filterRooms(all, { mode: 'any', towers: 'off' })).toEqual([ffa, teams]);
    expect(filterRooms(all, { mode: 'teams', towers: 'on' })).toEqual([]);
  });

  it('reads stored filters, and none from anything it cannot read', () => {
    expect(parseFilters('{"mode":"teams","towers":"off"}')).toEqual({
      mode: 'teams',
      towers: 'off',
    });
    expect(parseFilters('{"mode":"duel"}')).toEqual(NO_FILTERS);
    expect(parseFilters('not json')).toEqual(NO_FILTERS);
    expect(parseFilters(null)).toEqual(NO_FILTERS);
  });
});
