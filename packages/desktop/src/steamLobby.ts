import type * as Steamworks from 'steamworks.js';
import type { matchmaking } from 'steamworks.js/client.js';

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

/** A lobby as Find a game reads it. */
export interface ListedLobby {
  lobby: string;
  owner: string;
  data: Record<string, string>;
}

export class SteamLobby {
  private current: matchmaking.Lobby | null = null;
  /** The room the host's page holds, for a guest asking where the game is. */
  private room: string | null = null;

  constructor(
    private readonly client: Client,
    private readonly log: (line: string) => void,
  ) {}

  /** The host's answer to a guest asking where its game is, or null while it hosts none. */
  here(): string | null {
    if (this.room === null) return null;
    return JSON.stringify({ room: this.room, lobby: this.current?.id.toString() ?? null });
  }

  async create(kind: LobbyKind): Promise<string | null> {
    this.leave();
    try {
      this.current = await this.client.matchmaking.createLobby(LOBBY_TYPE[kind], MAX_MEMBERS);
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

  /** Steam's public lobbies of this App ID, with their data and owners. */
  async list(): Promise<ListedLobby[]> {
    try {
      const lobbies = await this.client.matchmaking.getLobbies();
      return lobbies.map((lobby) => ({
        lobby: lobby.id.toString(),
        owner: lobby.getOwner().steamId64.toString(),
        data: lobby.getFullData(),
      }));
    } catch (e) {
      this.log(`no lobby list: ${(e as Error).message}`);
      return [];
    }
  }
}
