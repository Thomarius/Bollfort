import { defaultConfigBundle, type CampaignLevelRules } from '@bollfort/config';
import {
  campaignRuleset,
  levelSetup,
  parseCampaignSave,
  recordLevel,
  retryLevel,
  won,
  type CampaignSave,
} from '@bollfort/campaign';
import type { CampaignSetup, Seat, ServerMessage } from '@bollfort/protocol';
import type { MatchState } from '@bollfort/sim';

import { app, audio } from './app.js';
import { browserId } from './browserId.js';
import { drawMapPreview } from './campaignMap.js';
import { deleteCampaign, writeCampaign } from './campaignSaves.js';
import {
  campaignRoomMarkup,
  campaignStartBlocked,
  type CampaignRoomView,
} from './campaignScreens.js';
import { t } from './i18n.js';
import type { MatchExits } from './matchScreen.js';
import { ServerConnection } from './net/connection.js';

/**
 * A co-op campaign's room (docs/CAMPAIGN.md §13, CA11): the host's page opens it with their saved
 * campaign and sends it each level; the room plays the level among the people at its table, and the
 * host's page records the result in its save — the only save (the user's, 2026-11-25) — and sends
 * the next. The teammates' pages show what the host's sends. The room's plumbing (joining, Steam,
 * a dropped link) is the lobby's (`lobbyFlow.ts`), which hands a campaign's room to this.
 */

const config = defaultConfigBundle.campaign;

/** How long the host's page waits for a server to open the room. */
const SERVER_WAIT_MS = 2000;

/** What a campaign's room needs of the lobby that runs it. */
export interface CampaignRoomLink {
  send: ServerConnection['send'];
  /** Leaves the room for the menu. */
  leave(): void;
  /** The lobby's own wiring of what the room's screen shares with it: the code's Copy. */
  wireCopies(code: string, invite: string | null): void;
}

/** A campaign's room's own state, beside the lobby's: the host's save and the level set. */
export class CampaignRoom {
  save: CampaignSave | null = null;
  level: CampaignSetup | null = null;
  /** The level before was cleared here, and its record goes over the next one's intro. */
  justCleared = false;

  /** Takes in a message the room sent; whether the screen should be drawn again. */
  heard(message: ServerMessage): boolean {
    if (message.type === 'room' && message.campaign !== undefined) {
      this.level = message.campaign.level;
      return true;
    }
    if (message.type === 'campaignSave') {
      this.save = readSave(message.save);
      return true;
    }
    return false;
  }

  /** The room's screen: the next level's intro and seats, or the defeat, or the end. */
  draw(
    seats: readonly Seat[],
    playerCount: number,
    hostId: number,
    humanPlayer: number,
    code: string,
    invite: string | null,
    link: CampaignRoomLink,
  ): void {
    const rules =
      this.level === null
        ? null
        : (campaignRuleset(config, defaultConfigBundle.ruleset, this.level)
            .campaign as CampaignLevelRules);
    const view: CampaignRoomView = {
      save: this.save,
      level: this.level,
      shape: rules?.shape ?? null,
      seats,
      playerCount,
      hostId,
      humanPlayer,
      code,
      invite,
      justCleared: this.justCleared,
    };
    const sails = Object.values(defaultConfigBundle.art.campaign.sails);
    app!.innerHTML = campaignRoomMarkup(config, view, sails);
    if (rules !== null && this.level !== null) drawMapPreview(rules, this.level.seed);
    link.wireCopies(code, invite);
    const on = (id: string, go: () => void): void =>
      app!.querySelector(`#${id}`)?.addEventListener('click', () => {
        audio.play('select');
        go();
      });
    on('start-level', () => {
      if (campaignStartBlocked(view) === null) link.send({ type: 'start' });
    });
    on('ready', () => {
      const me = seats.find((s) => s.playerId === humanPlayer);
      link.send({ type: 'ready', ready: me?.ready !== true });
    });
    on('retry-level', () => {
      const save = this.save;
      if (save === null) return;
      const retried = retryLevel(save, new Date().toISOString());
      writeCampaign(retried);
      this.justCleared = false;
      sendLevel(link, retried);
    });
    on('leave', () => link.leave());
    on('back', () => link.leave());
  }

  /**
   * The level's match's ways out: on the host's page the result recorded and saved as the level
   * ends, and its Continue sending the room on — the next level, the retry's defeat, or the end;
   * on a teammate's, the wait for the host.
   */
  exits(host: boolean, link: CampaignRoomLink): MatchExits {
    const before = this.save;
    let after: CampaignSave | null = null;
    return {
      finished: (state) => {
        if (host && before !== null) {
          after = {
            ...recordLevel(config, before, outcomeOf(state), new Date().toISOString()),
            // The labels in the save, the names the people played under.
            players: state.players.map((p) => ({ name: p.name })),
          };
          writeCampaign(after);
        }
        this.justCleared = state.endedBy === 'level_cleared';
        return state.endedBy === 'level_cleared'
          ? t('campaign.cleared', { n: (before?.stage ?? 0) + 1 })
          : '';
      },
      leaveConfirm: 'campaign.leaveConfirm',
      ...(host
        ? {
            next: {
              label: 'campaign.continue',
              go: () => {
                if (after !== null) sendLevel(link, after);
              },
            },
          }
        : { waitLabel: 'campaign.waitHost' }),
      back: () => link.leave(),
    };
  }
}

/** The room set for where the campaign stands: its next level, or none at a defeat or its end. */
function sendLevel(link: CampaignRoomLink, save: CampaignSave): void {
  // A campaign won is over, its save gone as its end is shown, as a solo campaign's.
  if (save.finished && won(config, save)) deleteCampaign(save.id);
  const level = save.finished || save.defeated ? null : levelSetup(config, save);
  link.send({ type: 'campaign', level, save: JSON.stringify(save) });
}

function readSave(json: string): CampaignSave | null {
  try {
    const parsed = parseCampaignSave(JSON.parse(json));
    return parsed.ok ? parsed.save : null;
  } catch {
    return null;
  }
}

/** How the match left the level, for the campaign's record. */
export function outcomeOf(state: MatchState): Parameters<typeof recordLevel>[2] {
  const fleet = state.campaign;
  return {
    cleared: state.endedBy === 'level_cleared',
    scores: state.players.map((p) => p.score),
    lives: state.teams[0]?.continuesRemaining ?? 0,
    rounds: state.round,
    shape: state.ruleset.campaign?.shape ?? 'coast',
    sunk: fleet === null ? [0, 0, 0] : [...fleet.sunk],
    grunts: fleet?.gruntsKilled ?? 0,
  };
}

/**
 * Opens a co-op room for a saved campaign, on the server this page came from, and sends it the
 * campaign where it stands. Null when no server answered: co-op is played through rooms only.
 */
export async function openCampaignConnection(
  save: CampaignSave,
  name: string,
  isPublic: boolean,
): Promise<{
  connection: ServerConnection;
  welcome: Extract<ServerMessage, { type: 'welcome' }>;
} | null> {
  const connection = new ServerConnection(ServerConnection.defaultUrl());
  connection.browserId = browserId();
  const answered = new Promise<ServerMessage | null>((resolve) => {
    connection.onMessage((message) => {
      if (message.type === 'welcome' || message.type === 'error') resolve(message);
    });
    setTimeout(() => resolve(null), SERVER_WAIT_MS);
  });
  connection.connect().catch(() => undefined);
  connection.createRoom(name, save.players.length, isPublic, true);
  const first = await answered;
  if (first?.type !== 'welcome') {
    connection.close();
    return null;
  }
  sendLevel(
    { send: (m) => connection.send(m), leave: () => undefined, wireCopies: () => undefined },
    save,
  );
  return { connection, welcome: first };
}
