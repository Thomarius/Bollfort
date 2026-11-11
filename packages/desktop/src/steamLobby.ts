import type * as Steamworks from 'steamworks.js';
import type { matchmaking } from 'steamworks.js/client.js';

import type { InviteUser } from './steamInvite.js';
import type { LobbyFinder } from './steamLobbyFinder.js';

/**
 * The Steam lobby beside a room (STEAM.md §7.3, S3.3): made by the host as the room is, its
 * data the games browser's listing, closed to joins while a match runs; joined by a guest for
 * Steam's own view of who plays together — never for a seat, which is the server's to give
 * (a guest is seated over P2P, lobby or not). One lobby at a time, as one room at a time.
 */

type Client = ReturnType<typeof Steamworks.init>;

/** Who may join the lobby, as the host chose under Play (S3.3). */
export type LobbyKind = 'friends' | 'public' | 'invite';

/** `matchmaking.LobbyType`, a const enum, by number. */
const LOBBY_TYPE: Record<LobbyKind, matchmaking.LobbyType> = {
  invite: 0 as matchmaking.LobbyType.Private,
  friends: 1 as matchmaking.LobbyType.FriendsOnly,
  public: 2 as matchmaking.LobbyType.Public,
};

/** Seats at the largest table. */
const MAX_MEMBERS = 8;

/** A lobby an invite or Join asked for, and who invited, where Steam says. */
export interface AskedLobby {
  lobby: string;
  from: string | null;
}

/** A lobby as Find a game reads it. */
export interface ListedLobby {
  lobby: string;
  owner: string;
  data: Record<string, string>;
}

/**
 * The host's own lobby data, beside the page's: its owner, which Steam tells only a lobby's
 * members and a search's finder, so a friend's lobby found through the friend can be dialled;
 * and its type, so an Invite only lobby a friend sits in is never listed.
 */
export const OWNER_KEY = 'owner';
export const KIND_KEY = 'kind';

/** How long a friend's lobby's data is waited for, and how often looked for. */
const FRIEND_DATA_MS = 2000;
const FRIEND_DATA_POLL_MS = 100;

/** What `gatherLobbies` asks: Steam's search, filtered, and its friends' lobbies. */
export interface LobbySources {
  /** Steam's search for public lobbies, filtered to these key-values where it can be. */
  search(equal: Record<string, string>): Promise<ListedLobby[]>;
  /** The lobbies friends playing this game are in, their data asked for. */
  friendsLobbies(): string[];
  data(lobby: string): Record<string, string>;
  sleep(ms: number): Promise<void>;
}

/**
 * Find a game's lobbies: friends' first, as the design has it (STEAM.md §4) — Friends lobbies,
 * which Steam's search never returns, and Public ones a friend is in — then the search's,
 * each once. A friend's lobby is listed once its data has come, with an owner and the filter's
 * values, and never an Invite only one.
 */
export async function gatherLobbies(
  sources: LobbySources,
  equal: Record<string, string>,
): Promise<ListedLobby[]> {
  const asked = [...new Set(sources.friendsLobbies())];
  const searched = await sources.search(equal);
  const friends: ListedLobby[] = [];
  let waiting = asked;
  for (let waited = 0; ; waited += FRIEND_DATA_POLL_MS) {
    const still: string[] = [];
    for (const lobby of waiting) {
      const data = sources.data(lobby);
      if (Object.keys(data).length === 0) still.push(lobby);
      else {
        const owner = data[OWNER_KEY] ?? '';
        const fits = Object.entries(equal).every(([key, value]) => data[key] === value);
        if (fits && /^\d{1,20}$/.test(owner) && data[KIND_KEY] !== 'invite')
          friends.push({ lobby, owner, data });
      }
    }
    waiting = still;
    if (waiting.length === 0 || waited >= FRIEND_DATA_MS) break;
    await sources.sleep(FRIEND_DATA_POLL_MS);
  }
  const ids = new Set(friends.map((f) => f.lobby));
  // Asked in the order Steam lists friends, so the order does not hang on whose data came first.
  friends.sort((a, b) => asked.indexOf(a.lobby) - asked.indexOf(b.lobby));
  return [...friends, ...searched.filter((l) => !ids.has(l.lobby))];
}

/** Where the asker stands in the host's room (`Room.standing`). */
export interface Standing {
  seated: boolean;
  started: boolean;
  finished: boolean;
  round: number;
  maxRounds: number | null;
}

/**
 * The host's answer to a guest asking where its game is (S3.3): its room, its lobby, the
 * host's Steam name, and where the asker stands there (S3.6) — what a restarted guest's
 * prompt says, and whether it is offered at all. Null while the host hosts nothing.
 */
export function hereAnswer(
  where: { room: string; lobby: string | null } | null,
  standing: (room: string) => Standing | null,
  host: string | null,
): string | null {
  if (where === null) return null;
  return JSON.stringify({ ...where, host, you: standing(where.room) });
}

export class SteamLobby {
  private current: matchmaking.Lobby | null = null;
  /** The room the host's page holds, for a guest asking where the game is. */
  private room: string | null = null;

  constructor(
    private readonly client: Client,
    private readonly log: (line: string) => void,
    private readonly sendInvite: InviteUser | null = null,
    private readonly finder: LobbyFinder | null = null,
    private readonly appId = 0,
  ) {}

  /** Where the page's game is, for a guest asking: its room and lobby, or null while it hosts none. */
  where(): { room: string; lobby: string | null } | null {
    if (this.room === null) return null;
    return { room: this.room, lobby: this.current?.id.toString() ?? null };
  }

  async create(kind: LobbyKind): Promise<string | null> {
    this.leave();
    try {
      this.current = await this.client.matchmaking.createLobby(LOBBY_TYPE[kind], MAX_MEMBERS);
      this.current.mergeFullData({
        [OWNER_KEY]: this.client.localplayer.getSteamId().steamId64.toString(),
        [KIND_KEY]: kind,
      });
      this.log(`lobby ${this.current.id} made (${kind})`);
      return this.current.id.toString();
    } catch (e) {
      this.log(`no lobby made: ${(e as Error).message}`);
      return null;
    }
  }

  /** The room the page hosts now, or null: what a guest asking is told. */
  setRoom(room: string | null): void {
    this.room = room;
  }

  setData(data: Record<string, string>): void {
    this.current?.mergeFullData(data);
  }

  setJoinable(joinable: boolean): void {
    this.current?.setJoinable(joinable);
  }

  /** Joins a lobby; its owner's Steam ID, or null if Steam refused. */
  async join(lobby: string): Promise<string | null> {
    if (!/^\d{1,20}$/.test(lobby)) return null;
    if (this.current?.id.toString() === lobby) return this.current.getOwner().steamId64.toString();
    this.leave();
    try {
      this.current = await this.client.matchmaking.joinLobby(BigInt(lobby));
      // In the words the bench looks for (tools/steambench), as the spike's were.
      this.log(`joined lobby ${lobby}`);
      return this.current.getOwner().steamId64.toString();
    } catch (e) {
      this.log(`join failed: lobby ${lobby}: ${(e as Error).message}`);
      return null;
    }
  }

  leave(): void {
    if (this.current === null) return;
    this.log(`lobby ${this.current.id} left`);
    this.current.leave();
    this.current = null;
    this.room = null;
  }

  /** The lobby's ID, made or joined, or null: for the bench. */
  get id(): string | null {
    return this.current?.id.toString() ?? null;
  }

  invite(): void {
    this.current?.openInviteDialog();
  }

  /** A Steam invite to this lobby sent straight to one player: Invite back (S3.6). */
  inviteUser(steamId: string): void {
    if (this.current === null || this.sendInvite === null) return;
    const sent = this.sendInvite(this.current.id.toString(), steamId);
    // In the words the bench looks for (tools/steambench).
    this.log(sent ? `invited ${steamId} back` : `invite to ${steamId} not sent`);
  }

  /**
   * Our lobbies for Find a game, with their data and owners: friends' first, then Steam's public
   * ones whose data has these key-values — filtered by Steam where the FFI opened, else here.
   */
  async list(equal: Record<string, string> = {}): Promise<ListedLobby[]> {
    const finder = this.finder;
    const search = async (filter: Record<string, string>): Promise<ListedLobby[]> => {
      finder?.filterNext(filter);
      const lobbies = await this.client.matchmaking.getLobbies();
      return lobbies
        .map((lobby) => ({
          lobby: lobby.id.toString(),
          owner: lobby.getOwner().steamId64.toString(),
          data: lobby.getFullData(),
        }))
        .filter((l) => Object.entries(filter).every(([key, value]) => l.data[key] === value));
    };
    try {
      const lobbies = await gatherLobbies(
        {
          search,
          friendsLobbies: () => {
            if (finder === null) return [];
            const found = finder.friendsLobbies(this.appId);
            for (const lobby of found) finder.requestData(lobby);
            return found;
          },
          data: (lobby) => finder?.data(lobby) ?? {},
          sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
        },
        equal,
      );
      // In the words the bench looks for (tools/steambench).
      this.log(`lobbies listed: ${lobbies.length}`);
      return lobbies;
    } catch (e) {
      this.log(`no lobby list: ${(e as Error).message}`);
      return [];
    }
  }
}
