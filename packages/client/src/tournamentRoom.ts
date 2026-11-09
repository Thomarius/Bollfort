import { defaultConfigBundle, type TowerVariant } from '@bollfort/config';
import type { Seat, ServerMessage, TournamentTable } from '@bollfort/protocol';
import {
  HOST_TEAM,
  mapSeed,
  matchSettingsOf,
  matchTable,
  type Progress,
  type Save,
} from '@bollfort/tournament';

import { ServerConnection } from './net/connection.js';
import { seatTowers, sentTower } from './tournamentTowers.js';
import { NetworkMatch } from './net/networkMatch.js';
import { stageLabel } from './tournamentText.js';
import { preferredTower } from './towers.js';
import { browserId } from './browserId.js';
import { hostSteamRoom, lobbyKind, roundOf, steamPlay, type SteamRoom } from './steam/steamPlay.js';

/**
 * A tournament's room on the server (ARCHIVE 12zj), held by its host for as long as
 * the tournament is open: teammates join it by its code, for any of the matches, and the
 * host sends it each match's table. The tournament itself stays on the host's computer; the
 * room plays only the match it is sent.
 */

/** How long to wait for a server, as the lobby waits, before playing on alone. */
const SERVER_WAIT_MS = 2000;

/**
 * A tournament's match as the room is sent it: the tournament's table, its bots by name,
 * level and personality, the seats of the host's team's bots open to people, and the step's
 * map and words.
 */
export function roomTable(save: Save, progress: Progress): TournamentTable | null {
  const teams = progress.next?.matches[progress.hostMatch];
  if (teams === undefined) return null;
  const table = matchTable(save, teams);
  const hostTeam = teams.indexOf(HOST_TEAM);
  const towers = seatTowers(save, table);
  return {
    // Field by field: the table's seat carries more than the room is sent.
    seats: table.seats.map((seat, i) => ({
      name: seat.name,
      level: seat.level,
      personality: seat.personality,
      team: seat.team,
      open: seat.team === hostTeam && seat.level !== null,
      ...sentTower(towers[i] ?? 'drawn'),
    })),
    teamNames: teams.map((id) => save.teams[id]?.name ?? ''),
    settings: matchSettingsOf(save, defaultConfigBundle.ruleset.elimination.continues),
    seed: mapSeed(save, progress.done),
    tournament: { id: save.id, step: progress.done },
    stage: stageLabel(save, progress.done),
  };
}

export class TournamentRoom {
  readonly match: NetworkMatch;
  code = '';
  /** The room's address on the internet, while the host's port is open there. */
  invite: string | null = null;
  /** The people at the table, the host among them, as the room last said. */
  people: readonly Seat[] = [];
  hostId = 0;
  /** Called as the room changes: somebody arrived, left or moved. */
  onChange: (() => void) | null = null;
  /** Called as a match starts: the snapshot has come. */
  onSnapshot: (() => void) | null = null;
  private readonly pinging: ReturnType<typeof setInterval>;
  /** A match under way or over in the room, as it last said: the seat is kept through both. */
  private playing = false;
  /**
   * The Steam lobby beside the room under the Steam build, as a single match's lobby has
   * (STEAM.md §7.3): teammates join and come back through it as through any other; null
   * outside Steam.
   */
  steam: SteamRoom | null = null;

  private constructor(readonly connection: ServerConnection) {
    this.match = new NetworkMatch(connection);
    connection.onMessage((message) => this.receive(message));
    // A drop in a match is got back by rejoining; between matches the seat is not kept.
    connection.rejoinWhile(() => this.playing);
    this.pinging = setInterval(() => {
      if (connection.state === 'closed') clearInterval(this.pinging);
      else connection.ping();
    }, 2000);
  }

  /**
   * A new room for the tournament, or null when no server answers within the wait — a
   * page from the dev server, or the desktop app's window with nobody to share it with.
   */
  static async open(name: string, isPublic: boolean): Promise<TournamentRoom | null> {
    const connection = new ServerConnection(ServerConnection.defaultUrl());
    connection.browserId = browserId();
    const answered = new Promise<ServerMessage | null>((resolve) => {
      connection.onMessage((message) => {
        if (message.type === 'welcome' || message.type === 'error') resolve(message);
      });
      setTimeout(() => resolve(null), SERVER_WAIT_MS);
    });
    connection.connect().catch(() => undefined);
    // The room's player count is the table's to set; two is any count allowed.
    connection.createRoom(name, 2, isPublic);
    const first = await answered;
    if (first?.type !== 'welcome') {
      connection.close();
      return null;
    }
    const room = new TournamentRoom(connection);
    const steam = steamPlay();
    if (steam !== null) room.steam = await hostSteamRoom(steam, first.code, lobbyKind());
    room.receive(first);
    // The host's own tower, as they chose it last, for matches that play towers.
    room.special(preferredTower());
    return room;
  }

  get open(): boolean {
    return this.connection.state !== 'closed';
  }

  /** Everyone at the table but the host. */
  get guests(): Seat[] {
    return this.people.filter((seat) => seat.playerId !== this.hostId);
  }

  /** The room set for a match, and the tournament sent along for the teammates' pages. */
  sendTable(table: TournamentTable, save: Save): void {
    this.connection.send({ type: 'tournament', table, save: JSON.stringify(save) });
  }

  /** The tournament over: sent alone, since there is no next match to carry it. */
  sendEnd(save: Save): void {
    this.connection.send({ type: 'tournamentEnd', save: JSON.stringify(save) });
  }

  start(): void {
    this.connection.send({ type: 'start' });
  }

  /** The special tower the host brings, or none. */
  special(special: TowerVariant | null): void {
    this.connection.send({ type: 'special', special });
  }

  /** A person to another open seat: the bot whose seat they take sits the match out. */
  move(from: number, to: number): void {
    this.connection.send({ type: 'configure', move: { from, to } });
  }

  /** A teammate removed by the host (STEAM.md §5): their seat the team's bot again. */
  remove(seat: number): void {
    this.connection.send({ type: 'remove', seat });
  }

  close(): void {
    clearInterval(this.pinging);
    this.connection.close();
    this.steam?.left();
    this.steam = null;
  }

  private receive(message: ServerMessage): void {
    this.match.receive(message);
    switch (message.type) {
      case 'welcome':
        this.code = message.code;
        this.hostId = message.hostId;
        break;
      case 'room':
        this.code = message.code;
        this.hostId = message.hostId;
        this.people = message.seats;
        this.playing = message.started;
        this.invite =
          message.internet === null ? null : `${message.internet}/?join=${message.code}`;
        if (!message.started) this.onChange?.();
        break;
      case 'snapshot':
        this.playing = true;
        this.onSnapshot?.();
        break;
      default:
        break;
    }
    this.steam?.heard(message, this.playing, this.match.finished, roundOf(this.match.state));
  }
}
