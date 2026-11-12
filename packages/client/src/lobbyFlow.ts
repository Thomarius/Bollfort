import {
  artForStyle,
  defaultArtConfig,
  defaultConfigBundle,
  defaultTeams,
  reshapeTable,
  type BotTower,
  type MatchSettings,
  type TowerVariant,
  type Table,
} from '@bollfort/config';
import { botTowerOf, drawnSpecial } from '@bollfort/ai';
import { type ServerMessage } from '@bollfort/protocol';
import { Progress, parseSave, type Save } from '@bollfort/tournament';

import {
  addedSeats,
  lobbyMarkup,
  nudgedSettings,
  showRemove,
  type LobbyTab,
  type LobbyView,
} from './lobby.js';
import { enhanceChoices } from './choices.js';
import { joinRefusedNotice, refusalText } from './browser.js';
import { t } from './i18n.js';
import { motionReduced } from './motion.js';
import { drawPreview, tablePreview } from './preview.js';
import { ServerConnection } from './net/connection.js';
import { NetworkMatch } from './net/networkMatch.js';
import { STEAM_RETRY } from './net/steamDial.js';
import type { LobbyKind } from './host.js';
import { forgetMatch } from './steam/backToMatch.js';
import { readHostAnswer, stillPlaying } from './steam/rejoin.js';
import { onAvatars } from './steam/avatars.js';
import { steamIdOfCode } from './steam/steamCode.js';
import {
  guestSteamRoom,
  hostSteamRoom,
  lobbyKind,
  roundOf,
  steamPlay,
  type SteamRoom,
} from './steam/steamPlay.js';
import { store, stored } from './storage.js';
import { app, showError, audio, params } from './app.js';
import { browserId } from './browserId.js';
import { preferredStyles, randomSeed, chosenSeed } from './prefs.js';
import type { Setup } from './session.js';
import {
  SETTING_BOUNDS,
  DEFAULT_SETTINGS,
  localMatchFor,
  DEFAULT_BOT,
  DEFAULT_PLAYERS,
  localSession,
  networkSession,
} from './session.js';
import type { Common } from './menu.js';
import { showMenu } from './menu.js';
import { runSession } from './matchScreen.js';
import { openBracket } from './tournamentBracketView.js';
import { openLeague } from './tournamentLeagueView.js';
import { endingMarkup, tournamentTab } from './tournamentView.js';
import { openTowerMenu } from './towerMenu.js';
import { preferredSpecials, preferredTower, saveSpecials, saveTower } from './towers.js';
import { saveTable, storedTable, type RememberedTable } from './tableMemory.js';
import { tournamentEnded } from './steam/achievements.js';

/** The lobby, one screen whether a server holds the table or the browser does. */

const TOKEN_KEY = 'bollfort.seat';

/** How long to wait for a server before setting the table locally instead. */
const SERVER_WAIT_MS = 2000;

/** What the lobby's controls do, whichever backend is behind them. */
export interface LobbyHandlers {
  table(change: { settings?: MatchSettings; playerCount?: number; teams?: number[] }): void;
  bot(seat: number, level: number): void;
  /** The tower the bot in this seat brings: one chosen, none, or `drawn`, its draw. */
  botTower?(seat: number, tower: BotTower): void;
  /** A new map: a seed typed in, or a fresh random one. */
  seed(seed: number): void;
  /** A bot to play the host's own seat while they watch, or null to play it. */
  hostBot(level: number | null): void;
  /** The person in seat `from` to seat `to`, swapping with whoever sits there. */
  move(from: number, to: number): void;
  start(): void;
  /** A guest saying they are ready, or not after all; a local table has no guests. */
  ready?(ready: boolean): void;
  /** A tab chosen, to be kept open as the lobby is drawn again. */
  tab?(tab: LobbyTab): void;
  /** The special tower this person brings, or none; remembered for the next table. */
  special?(special: TowerVariant | null): void;
  /** The host removing the person in this seat (STEAM.md §5); a room's alone, never a local table. */
  remove?(seat: number): void;
  /** Steam's friend picker, under Steam, for the host (STEAM.md §7.3). */
  invite?(): void;
}

/** The table as last drawn, to see what a drawing changes; and the setting the host last changed. */
let drawn: LobbyView | null = null;
let touched: string | null = null;
/**
 * The guest the host has clicked Remove on once, asking to be sure, until a second click or
 * `REMOVE_ARMED_MS`: by seat and name, so a seat changing hands is not removed by mistake.
 */
let armed: { seat: number; name: string } | null = null;
const REMOVE_ARMED_MS = 4000;

/** Draws the lobby and wires its controls to whichever backend holds the table. */
export function drawLobby(view: LobbyView, on: LobbyHandlers): void {
  // What changed since the lobby on screen was drawn — never against one left before, which
  // only a lobby still on screen can be: seats gained slide in, and a setting changed by
  // another is marked a moment (2026-10-28).
  const before =
    drawn !== null && drawn.code === view.code && document.querySelector('.menu.lobby') !== null
      ? drawn
      : null;
  const nudged = before === null ? [] : nudgedSettings(before, view, touched);
  drawn = view;
  touched = null;
  // A guest is brought back here by the room after a match, never through the menu, and
  // heard the match's victory music on in the lobby until this (test session, 2026-10-12).
  // The track already up, this does nothing, so every redraw may ask.
  audio.music('music_menu');
  // The map, which island each seat is dealt and the colour it plays in: all known now,
  // since the seed is fixed while the table is set. See `preview.ts`.
  const { art, terrain } = defaultConfigBundle;
  const preview = tablePreview(view.seed, view.playerCount, view.teams, art, terrain);
  const stillArmed =
    armed !== null && view.seats.some((s) => s.playerId === armed?.seat && s.name === armed.name);
  if (!stillArmed) armed = null;
  app!.innerHTML = lobbyMarkup({
    ...view,
    removing: armed?.seat ?? null,
    seatColours: preview.colourOfSeat.map((c) => c.base),
    seatShapes: preview.shapeOfSeat,
    entering: addedSeats(before, view),
  });
  // The table's few-option choices as buttons, steppers and switches (`choices.ts`).
  enhanceChoices(app!);
  for (const id of nudged) {
    document.querySelector(`#${id}`)?.closest('label')?.classList.add('nudged');
  }
  // The map in the colours of the build look chosen in the menu, which is how the match
  // will open — the default's, when it is drawn at random as the match starts;
  // the seat cards keep the shared colours, which read on the lobby's panel.
  const chosen = preferredStyles().build;
  const look = artForStyle(art, chosen === 'random' ? defaultArtConfig.styles.build : chosen);
  const map = tablePreview(view.seed, view.playerCount, view.teams, look, terrain);
  const canvas = document.querySelector<HTMLCanvasElement>('#map-preview');
  if (canvas !== null) {
    // Alive while the lobby is open (PLAN 11.11 W7): redrawn each frame until the canvas
    // is replaced — every change to the table redraws the lobby — or the lobby goes. Still
    // under reduced motion.
    const frame = (now: number): void => {
      if (!canvas.isConnected) return;
      drawPreview(canvas, map, view.humanPlayer, look, 320, art, motionReduced() ? 0 : now);
      if (!motionReduced()) requestAnimationFrame(frame);
    };
    frame(performance.now());
  }
  const number = (id: string, apply: (n: number) => void): void => {
    const field = document.querySelector<HTMLSelectElement>(id);
    field?.addEventListener('change', () => {
      audio.play('select');
      touched = field.id;
      apply(Number(field.value));
    });
  };
  number('#team-size', (teamSize) => on.table({ settings: { ...view.settings, teamSize } }));
  number('#player-count', (playerCount) => on.table({ playerCount }));
  const specials = document.querySelector<HTMLSelectElement>('#specials');
  specials?.addEventListener('change', () => {
    audio.play('select');
    saveSpecials(specials.value === 'on');
    on.table({ settings: { ...view.settings, specials: specials.value === 'on' } });
  });
  const mine = document.querySelector<HTMLButtonElement>('#my-special');
  mine?.addEventListener('click', () => {
    audio.play('select');
    const current = mine.dataset['variant'];
    openTowerMenu({
      chosen: current === '' || current === undefined ? null : (current as TowerVariant),
      onChoose: (special) => {
        // A person's menu offers no Random.
        if (special === 'drawn') return;
        saveTower(special);
        on.special?.(special);
      },
      click: () => audio.play('select'),
      // Gone with the lobby, a match begun, or the host turning towers off.
      alive: () => document.querySelector('#my-special') !== null,
    });
  });
  // The host choosing a bot's tower, Random among the choices: it stays with the seat, into a
  // rematch, as its level does (the user's, 2026-10-25).
  for (const button of document.querySelectorAll<HTMLButtonElement>('.bot-tower')) {
    button.addEventListener('click', () => {
      audio.play('select');
      const seat = Number(button.dataset['seat']);
      const choice = button.dataset['choice'];
      openTowerMenu({
        chosen: choice === 'none' ? null : ((choice ?? 'drawn') as BotTower),
        drawn: drawnSpecial(view.seed, seat, defaultConfigBundle.ruleset.specials),
        title: t('towerMenu.botTitle', { n: seat + 1 }),
        onChoose: (tower) => on.botTower?.(seat, tower),
        click: () => audio.play('select'),
        alive: () => document.querySelector(`.bot-tower[data-seat="${seat}"]`) !== null,
      });
    });
  }
  for (const field of document.querySelectorAll<HTMLSelectElement>('.bot-select')) {
    field.addEventListener('change', () => {
      audio.play('select');
      on.bot(Number(field.dataset.seat), Number(field.value));
    });
  }
  document.querySelector('#reroll')?.addEventListener('click', () => {
    audio.play('select');
    on.seed(randomSeed());
  });
  // The host's own seat: played by them, or by a bot at the level a bot's seat has by default.
  const hostPlay = document.querySelector<HTMLSelectElement>('#host-play');
  hostPlay?.addEventListener('change', () => {
    audio.play('select');
    on.hostBot(hostPlay.value === 'bot' ? DEFAULT_BOT : null);
  });
  const hostBot = document.querySelector<HTMLSelectElement>('#host-bot');
  hostBot?.addEventListener('change', () => {
    audio.play('select');
    on.hostBot(Number(hostBot.value));
  });
  // Remove, asked twice: the first click asks to be sure, the second removes; left alone, it
  // goes back after a few seconds.
  for (const button of document.querySelectorAll<HTMLButtonElement>('.remove-seat')) {
    button.addEventListener('click', () => {
      audio.play('select');
      const seat = Number(button.dataset['seat']);
      if (armed?.seat === seat) {
        armed = null;
        on.remove?.(seat);
        return;
      }
      const name = button.dataset['name'] ?? '';
      armed = { seat, name };
      const asked = armed;
      // In place, as a drawing would show it; a redraw meanwhile keeps it by `removing`.
      showRemove(button, true, name);
      setTimeout(() => {
        if (armed !== asked) return;
        armed = null;
        const shown = document.querySelector<HTMLButtonElement>(
          `.remove-seat[data-seat="${seat}"]`,
        );
        if (shown !== null) showRemove(shown, false, name);
      }, REMOVE_ARMED_MS);
    });
  }
  // Who sits where. Teams belong to seats, so this is how people choose sides.
  for (const button of document.querySelectorAll<HTMLButtonElement>('.sit')) {
    button.addEventListener('click', () => {
      audio.play('select');
      on.move(Number(button.dataset.player), Number(button.dataset.seat));
    });
  }

  // Copying beats reading a code aloud, and the fallback matters: the clipboard API
  // is unavailable over plain http on anything but localhost, which is exactly how
  // somebody will first try this on a home network. There `navigator.clipboard` is
  // undefined, and an optional call on it once skipped the fallback too, so the button
  // did nothing at all (reported from Linux Mint over a LAN address).
  wireCopy('#copy-code', '#room-code', view.code ?? '');
  // The link for friends outside the house, while the host's port is open (PLAN 11.21).
  if (view.invite) wireCopy('#copy-invite', '#invite-link', view.invite);
  document.querySelector('#steam-invite')?.addEventListener('click', () => {
    audio.play('select');
    on.invite?.();
  });
  document.querySelector('#begin')?.addEventListener('click', () => {
    audio.play('select');
    on.start();
  });
  const ready = document.querySelector<HTMLButtonElement>('#ready');
  ready?.addEventListener('click', () => {
    audio.play('select');
    on.ready?.(ready.dataset.ready === 'true');
  });
  // A tournament's tabs, switched in place: the lobby is drawn again only when it changes.
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.lobby-tabs .tab')];
  for (const button of tabs) {
    button.addEventListener('click', () => {
      const chosen = button.dataset.tab as LobbyTab;
      audio.play('select');
      for (const other of tabs) {
        other.classList.toggle('on', other === button);
        other.setAttribute('aria-selected', String(other === button));
      }
      for (const panel of document.querySelectorAll<HTMLElement>('.tab-panel')) {
        panel.hidden = panel.dataset.panel !== chosen;
      }
      on.tab?.(chosen);
    });
  }
}

/** The bracket's button, or in the league the league's, where a tournament's tab or end shows one. */
export function wireBracket(save: Save, progress: Progress): void {
  document.querySelector('#bracket')?.addEventListener('click', () => {
    audio.play('select');
    openBracket(save, progress, () => audio.play('select'));
  });
  document.querySelector('#league')?.addEventListener('click', () => {
    audio.play('select');
    openLeague(save, progress, () => audio.play('select'));
  });
}

/** A tournament's end, won or out, as the host's page and their teammates' show it. */
export function showEnding(save: Save, progress: Progress, back: () => void): void {
  tournamentEnded(save, progress);
  app!.innerHTML = endingMarkup(save, progress);
  audio.music(progress.status.kind === 'won' ? 'music_victory' : 'music_defeat');
  wireBracket(save, progress);
  app!.querySelector('#back')?.addEventListener('click', () => {
    audio.play('select');
    back();
  });
}

/** A button that copies `text`, shown in the node `shown`; see the lobby's copy above. */
export function wireCopy(button: string, shown: string, text: string): void {
  const copy = document.querySelector<HTMLButtonElement>(button);
  copy?.addEventListener('click', () => {
    audio.play('select');
    const code = text;
    const copied = (): void => {
      copy.textContent = t('lobby.copied');
      setTimeout(() => (copy.textContent = t('lobby.copy')), 1200);
    };
    // The old way, still honoured over plain http: select the code and copy the selection.
    // Failing that, it is left selected so it can be copied by hand.
    const bySelection = (): void => {
      const node = document.querySelector(shown);
      if (node) globalThis.getSelection()?.selectAllChildren(node);
      let ok: boolean;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      if (ok) copied();
      else copy.textContent = t('lobby.selectCopy');
    };
    if (globalThis.isSecureContext && navigator.clipboard !== undefined) {
      navigator.clipboard.writeText(code).then(copied, bySelection);
    } else {
      bySelection();
    }
  });
}

/** The table as the local lobby holds it, and as a room reports it. */
interface TableState extends Table {
  seed: number;
  hostBot: number | null;
  /** Where the host sits: they may move to any seat, and the seat decides the team. */
  hostSeat: number;
  bots: number[];
  /** The tower each seat's bot brings, by seat, as the host set it. */
  botTowers: BotTower[];
  /** The special tower the host brings, where the match plays them. */
  special: TowerVariant | null;
}

/**
 * Plays a table on this computer: the person in seat 0 unless watching, bots in the
 * rest, islands shuffled among the seats exactly as the server would.
 */
function playLocally(common: Common, table: TableState): void {
  const setup: Setup = {
    ...common,
    seed: table.seed,
    // The host's seat is theirs unless they put a bot in it — then it is a match of bots
    // alone, and the host watches.
    seats: table.bots
      .slice(0, table.playerCount)
      .map((tier, seat) => (seat === table.hostSeat ? table.hostBot : tier)),
    settings: table.settings,
    teams: table.teams,
    specials: Array.from({ length: table.playerCount }, (_, seat) =>
      seat === table.hostSeat ? table.special : null,
    ),
    botTowers: table.botTowers.slice(0, table.playerCount),
  };
  // A rematch reopens this table as it was, on a new map (PLAN 11.18 Y6).
  const rematch = (): void => localLobby(common, table.playerCount, randomSeed(), table);
  void runSession(localSession(localMatchFor(setup), rematch), setup).catch((error: unknown) =>
    showError(t('error.failedToStart'), error),
  );
}

/**
 * Opens the lobby: a room if a server answers, a table on this computer if not.
 *
 * "Answers" means a welcome within the wait, not merely an open socket: under the dev
 * server the socket's address is the dev server's own, which may accept the connection
 * and then say nothing. Solo play never waits on a network for longer than that. Joining
 * by code does need the server, so that fails plainly rather than dropping the player at
 * a table of their own.
 */
export async function openLobby(
  common: Common,
  code: string | null,
  asked?: number,
  kind?: LobbyKind,
): Promise<void> {
  // Under Steam a code is a host's (STEAM.md §7.3): their game is reached over P2P, never the
  // server on this machine, which nobody else can reach.
  const steam = steamPlay();
  if (steam !== null && code !== null) {
    const host = steamIdOfCode(code);
    if (host === null) showMenu(t('steam.noGame'));
    else await joinSteam(common, host);
    return;
  }
  const seed = chosenSeed();
  // The table this person last set as host, for a table of their own — unless the address
  // asks for a count, which is how a scene for screenshots or a test sets one exactly.
  const remembered =
    code === null && asked === undefined
      ? storedTable(
          { ...DEFAULT_SETTINGS, specials: preferredSpecials() },
          SETTING_BOUNDS,
          defaultConfigBundle.ruleset.players,
          DEFAULT_BOT,
        )
      : null;
  const playerCount = asked ?? remembered?.playerCount ?? DEFAULT_PLAYERS;
  app!.innerHTML = `<div class="menu interim"><h1>${t('menu.settingTable')}</h1><p class="note">${t('menu.lookingForServer')}</p></div>`;
  const connection = new ServerConnection(ServerConnection.defaultUrl());
  connection.browserId = browserId();
  const answered = new Promise<ServerMessage | null>((resolve) => {
    connection.onMessage((message) => {
      if (message.type === 'welcome' || message.type === 'error') resolve(message);
    });
    setTimeout(() => resolve(null), SERVER_WAIT_MS);
  });
  connection.connect().catch(() => undefined);

  const seat = stored(TOKEN_KEY, 'session')?.split(':') ?? [];
  if (code === null) connection.createRoom(common.name, playerCount, common.isPublic);
  else if (seat[0] === code.toUpperCase() && seat[1])
    connection.joinRoom(common.name, code, seat[1]);
  else connection.joinRoom(common.name, code);

  const first = await answered;
  if (first?.type === 'welcome') {
    // A room draws its own random map; a seed asked for in the address is the host's
    // to set, like any other choice of theirs.
    if (code === null && params.get('seed') !== null) connection.send({ type: 'configure', seed });
    // Special towers as this host last set them; the room opens on the rules' default, off.
    if (code === null && preferredSpecials())
      connection.send({ type: 'configure', settings: { specials: preferredSpecials() } });
    // The remembered table, in the room's order: its shape, then the host to their seat
    // (which swaps the bots), then each seat's bot.
    if (remembered !== null) {
      const { maxRounds, teamSize, continues } = remembered.settings;
      connection.send({
        type: 'configure',
        settings: { maxRounds, teamSize, continues },
        playerCount: remembered.playerCount,
        teams: remembered.teams,
      });
      if (remembered.hostSeat !== first.hostId) {
        connection.send({
          type: 'configure',
          move: { from: first.hostId, to: remembered.hostSeat },
        });
      }
      connection.send({
        type: 'configure',
        bots: remembered.bots,
        botTowers: remembered.botTowers,
      });
    }
    // `&rounds=N`, the round cap for this room alone: how the Steam bench plays short matches
    // where the end screen, not the late game, is what it checks (STEAM.md §3.4).
    const rounds = askedRounds();
    if (code === null && rounds !== null)
      connection.send({ type: 'configure', settings: { maxRounds: rounds } });
    const steamRoom =
      steam !== null && code === null
        ? await hostSteamRoom(steam, first.code, kind ?? lobbyKind())
        : null;
    roomLobby(common, connection, code, first, steamRoom);
    return;
  }
  connection.close();
  // A game picked from the list may have filled or gone since it was listed: say so in the
  // Find a game window, its list fresh as it opens. Removed by the host: said in the menu.
  const refused = first?.type === 'error' && code !== null ? joinRefusedNotice(first.code) : null;
  if (refused !== null) {
    showMenu(refused, first?.type === 'error' && first.code !== 'removed');
    return;
  }
  if (first?.type === 'error') {
    showError(t('error.refused', { code: first.code }), refusalText(first.code, first.message));
    return;
  }
  if (code !== null) {
    showError(t('error.couldNotJoin'), t('error.noServer', { url: ServerConnection.defaultUrl() }));
    return;
  }
  localLobby(common, playerCount, seed, null, remembered);
}

/**
 * How long a join over Steam waits for the host's welcome once the host has answered: the
 * session is up by then, but a host's machine under load may be slow to seat anyone.
 */
const STEAM_WELCOME_WAIT_MS = 10_000;

/**
 * Joins a host's game over Steam (STEAM.md §7.3, S3.3), however it was asked for — a code,
 * Find a game, an invite, Join in the friends list, Back to the match: the host's app asked
 * over P2P where its game is, its lobby joined for Steam's own view of who plays together,
 * then its room over P2P. The host's answer says whether this player holds a seat there
 * (S3.6): if so the room gives it back, by Steam ID. `back` is for the match this player left —
 * Back to the match, the restart's prompt, the host's Invite back — and goes only to a match
 * still running with their seat in it, forgetting it otherwise.
 */
export async function joinSteam(common: Common, host: string, back = false): Promise<void> {
  const steam = steamPlay();
  if (steam === null) return;
  // A question over the menu — the restart's prompt, another invite's — answered by this join.
  document.querySelector('.steam-join-asked')?.remove();
  app!.innerHTML = `<div class="menu interim"><h1>${t(back ? 'steam.rejoining' : 'steam.joining')}</h1><p class="note">${t('menu.lookingForServer')}</p></div>`;
  const found = readHostAnswer(await steam.host.find(host));
  const room = back ? (stillPlaying(found) ? found.room : null) : (found?.room ?? null);
  if (room === null) {
    if (back) forgetMatch();
    showMenu(t(back ? 'steam.matchOver' : 'steam.noGame'));
    return;
  }
  // Best effort: the seat does not depend on it, and one held is given back without it.
  const lobby = found?.lobby ?? null;
  if (found?.you?.seated !== true && lobby !== null) void steam.host.lobbyJoin(lobby);

  const connection = new ServerConnection(host, STEAM_RETRY, steam.dial);
  connection.browserId = browserId();
  const answered = new Promise<ServerMessage | null>((resolve) => {
    connection.onMessage((message) => {
      if (message.type === 'welcome' || message.type === 'error') resolve(message);
    });
    setTimeout(() => resolve(null), STEAM_WELCOME_WAIT_MS);
  });
  connection.connect().catch(() => undefined);
  connection.joinRoom(steam.name, room);
  const first = await answered;
  if (first?.type === 'welcome') {
    roomLobby(
      common,
      connection,
      room,
      first,
      guestSteamRoom(steam, host, room, () => connection.state !== 'closed'),
    );
    return;
  }
  connection.close();
  steam.host.lobbyLeave();
  if (back) {
    forgetMatch();
    showMenu(t('steam.matchOver'));
    return;
  }
  const refused = first?.type === 'error' ? joinRefusedNotice(first.code) : null;
  if (refused !== null) {
    showMenu(refused, first?.type === 'error' && first.code !== 'removed');
    return;
  }
  showMenu(t('steam.noGame'));
}

/** `&rounds=N` from the address, within the lobby's bounds, or null. */
function askedRounds(): number | null {
  const asked = params.get('rounds');
  if (asked === null || !/^\d{1,2}$/.test(asked)) return null;
  const n = Number(asked);
  const { min, max } = SETTING_BOUNDS.maxRounds;
  return n >= min && n <= max ? n : null;
}

/**
 * How long the room holds a lobby's seat for a guest who dropped, as the server's
 * `reconnect.lobbyHoldMs` (S3.6): the page tries to get back to it for as long.
 */
const LOBBY_HOLD_MS = 10_000;

/** The lobby with no server: the table lives here, under the same rules as a room's. */
/**
 * `kept` is a table to open as it was, for a rematch; otherwise the one last set here, or
 * a fresh one.
 */
function localLobby(
  common: Common,
  playerCount: number,
  seed: number,
  kept: TableState | null = null,
  remembered: RememberedTable | null = null,
): void {
  const limits = defaultConfigBundle.ruleset.players;
  const start = reshapeTable(
    {
      settings: { ...DEFAULT_SETTINGS, specials: preferredSpecials() },
      playerCount: limits.min,
      teams: defaultTeams(limits.min, 1),
    },
    { playerCount },
    limits,
    1,
  );
  let table: TableState =
    kept === null && remembered !== null
      ? {
          ...remembered,
          bots: [...remembered.bots],
          botTowers: [...remembered.botTowers],
          seed,
          hostBot: null,
          special: preferredTower(),
        }
      : kept === null
        ? {
            ...start,
            bots: Array.from({ length: limits.max }, () => DEFAULT_BOT),
            botTowers: Array.from({ length: limits.max }, (): BotTower => 'drawn'),
            seed,
            hostBot: null,
            hostSeat: 0,
            special: preferredTower(),
          }
        : {
            ...kept,
            bots: [...kept.bots],
            botTowers: [...kept.botTowers],
            teams: [...kept.teams],
            seed,
          };

  const redraw = (): void => {
    // Every change kept for the next table, as it is made.
    saveTable(table);
    drawLobby(
      {
        code: null,
        playerCount: table.playerCount,
        hostId: table.hostSeat,
        humanPlayer: table.hostSeat,
        seats: [
          {
            playerId: table.hostSeat,
            name: common.name,
            isBot: false,
            connected: true,
            ready: true,
            special: table.special,
          },
        ],
        bots: table.bots.slice(0, table.playerCount),
        botTowers: table.botTowers.slice(0, table.playerCount),
        settings: table.settings,
        settingBounds: SETTING_BOUNDS,
        teams: table.teams,
        playerLimits: limits,
        seed: table.seed,
        hostBot: table.hostBot,
      },
      {
        table: (change) => {
          table = { ...table, ...reshapeTable(table, change, limits, 1) };
          // A table shrunk out from under the host brings them to the first seat.
          if (table.hostSeat >= table.playerCount) table.hostSeat = 0;
          redraw();
        },
        bot: (seat, tier) => {
          table.bots[seat] = tier;
          redraw();
        },
        botTower: (seat, tower) => {
          table.botTowers[seat] = tower;
          redraw();
        },
        seed: (seed) => {
          table.seed = seed;
          redraw();
        },
        hostBot: (tier) => {
          table.hostBot = tier;
          redraw();
        },
        move: (from, to) => {
          // Only the host can be moved here; the bot in the seat they take gets theirs.
          if (from !== table.hostSeat || to >= table.playerCount) return;
          [table.bots[from], table.bots[to]] = [
            table.bots[to] ?? DEFAULT_BOT,
            table.bots[from] ?? DEFAULT_BOT,
          ];
          [table.botTowers[from], table.botTowers[to]] = [
            botTowerOf(table.botTowers, to),
            botTowerOf(table.botTowers, from),
          ];
          table.hostSeat = to;
          redraw();
        },
        start: () => playLocally(common, table),
        special: (special) => {
          table.special = special;
          redraw();
        },
      },
    );
    // Wired at every drawing, as the room's lobby does: the drawing replaces the button, and
    // wired once, Leave did nothing after the first change to the table.
    document.querySelector('#leave')?.addEventListener('click', () => showMenu());
  };
  redraw();
}

/**
 * The lobby as a room on the server. At the start, a table nobody else has joined is
 * played locally from the room's settings, and the room is left: there is nobody to
 * share a server with.
 */
function roomLobby(
  common: Common,
  connection: ServerConnection,
  code: string | null,
  welcome: Extract<ServerMessage, { type: 'welcome' }>,
  steam: SteamRoom | null = null,
): void {
  const match = new NetworkMatch(connection);
  /** The Steam lobby and presence left, once, however the room is left (STEAM.md §7.3). */
  let steamLeft = false;
  const leaveSteam = (): void => {
    if (steamLeft) return;
    steamLeft = true;
    steam?.left();
  };
  let view: LobbyView | null = null;
  /** The table as it stood before the start, which is what the seats were dealt from. */
  let table: LobbyView | null = null;
  let roomCode = code ?? '';
  let hostId = -1;
  /** Whether the host is still at the table, as the room last said: gone, nobody calls the next match. */
  let hostHere = true;
  let started = false;
  /** An error from the room is on screen, which a lost connection must not cover. */
  let refused = false;
  /** Takes the match down, for a rematch bringing the room back to its lobby. */
  let endMatch: (() => void) | null = null;
  /** The host's tournament as they last sent it, at a tournament's table, and where it stands. */
  let tournament: { save: Save; progress: Progress } | null = null;
  /** The tab open, and the tournament's step it was chosen at: each match opens on its own. */
  let tab: LobbyTab = 'match';
  let tabStep = -1;

  const tableOf = (v: LobbyView): TableState => ({
    settings: v.settings,
    playerCount: v.playerCount,
    teams: [...v.teams],
    bots: [...v.bots],
    botTowers: Array.from({ length: v.playerCount }, (_, seat) => botTowerOf(v.botTowers, seat)),
    seed: v.seed,
    hostBot: v.hostBot,
    hostSeat: v.hostId,
    special: v.seats.find((s) => s.playerId === v.hostId)?.special ?? null,
  });
  /** Seats already seen, so a newcomer can be marked as they arrive. */
  let known: Set<number> | null = null;

  const render = (): void => {
    if (started || view === null) return;
    const step = view.tournament?.tournament ?? null;
    const same = tournament !== null && step !== null && tournament.save.id === step.id;
    if (step !== null && step.step !== tabStep) {
      tab = 'match';
      tabStep = step.step;
    }
    const current: LobbyView = same
      ? { ...view, tournamentTab: tournamentTab(tournament!.save, tournament!.progress, tab) }
      : view;
    drawLobby(current, {
      table: (change) => connection.send({ type: 'configure', ...change }),
      bot: (seat, tier) => {
        const bots = [...current.bots];
        bots[seat] = tier;
        connection.send({ type: 'configure', bots });
      },
      botTower: (seat, tower) => {
        const botTowers = Array.from({ length: current.playerCount }, (_, i) =>
          botTowerOf(current.botTowers, i),
        );
        botTowers[seat] = tower;
        connection.send({ type: 'configure', botTowers });
      },
      seed: (seed) => connection.send({ type: 'configure', seed }),
      hostBot: (tier) => connection.send({ type: 'configure', hostBot: tier }),
      move: (from, to) => connection.send({ type: 'configure', move: { from, to } }),
      start: () => {
        if (current.seats.length > 1) {
          connection.send({ type: 'start' });
          return;
        }
        started = true;
        connection.close();
        leaveSteam();
        playLocally(common, tableOf(current));
      },
      ready: (ready) => connection.send({ type: 'ready', ready }),
      remove: (seat) => connection.send({ type: 'remove', seat }),
      ...(steam?.invite === undefined ? {} : { invite: steam.invite }),
      tab: (chosen) => (tab = chosen),
      special: (special) => connection.send({ type: 'special', special }),
    });
    if (same) wireBracket(tournament!.save, tournament!.progress);
    document.querySelector('#leave')?.addEventListener('click', () => {
      audio.play('select');
      started = true;
      connection.close();
      leaveSteam();
      showMenu();
    });
  };

  connection.onMessage((message) => {
    match.receive(message);
    switch (message.type) {
      case 'welcome':
        roomCode = message.code;
        hostId = message.hostId;
        store(TOKEN_KEY, `${message.code}:${message.token}`, 'session');
        break;
      case 'room': {
        hostId = message.hostId;
        hostHere = message.seats.some((s) => s.playerId === hostId && s.connected);
        // Somebody new at the table: marked as they arrive, and heard.
        const ids = new Set(message.seats.map((seat) => seat.playerId));
        const arrived = known === null ? [] : [...ids].filter((id) => !known?.has(id));
        if (arrived.length > 0 && !message.started) audio.play('select');
        known = ids;
        view = {
          code: steam?.code ?? roomCode,
          steamInvite: steam?.invite !== undefined,
          playerCount: message.playerCount,
          hostId,
          humanPlayer: match.humanPlayer,
          seats: message.seats,
          bots: [...message.bots],
          botTowers: [...message.botTowers],
          settings: message.settings,
          settingBounds: message.settingBounds,
          teams: [...message.teams],
          playerLimits: message.playerLimits,
          seed: message.seed,
          hostBot: message.hostBot,
          arrived,
          invite: message.internet === null ? null : `${message.internet}/?join=${roomCode}`,
          tournament: message.tournament,
        };
        // The host's own table kept for the next one, as the room reports it — not a
        // tournament's, which is the tournament's.
        // Nor one whose rounds the address set, which is a test's, not the host's choice.
        if (
          !message.started &&
          message.tournament === null &&
          match.humanPlayer === hostId &&
          askedRounds() === null
        ) {
          saveTable(tableOf(view));
        }
        if (!message.started) {
          // Unstarted again after a match: the host called a rematch, and the room is its
          // lobby once more, everyone in their old seats (PLAN 11.18 Y6).
          if (started) {
            endMatch?.();
            endMatch = null;
            started = false;
          }
          table = view;
          render();
        }
        break;
      }
      case 'tournamentSave':
        tournament = readTournament(message.save);
        // The tournament over, sent as the host's room closes: its end, as the host sees it,
        // in place of the last match's summary.
        if (started && tournament !== null && tournament.progress.status.kind !== 'playing') {
          endMatch?.();
          endMatch = null;
          connection.close();
          showEnding(tournament.save, tournament.progress, showMenu);
          break;
        }
        render();
        break;
      case 'snapshot':
        if (!started) {
          started = true;
          // A host who gave their seat to a bot watches it play, whoever else is here.
          const watching =
            view !== null && view.hostBot !== null && match.humanPlayer === view.hostId;
          // Each seat's bot level, or null for a person, in lobby order.
          const seats = Array.from({ length: table?.playerCount ?? 0 }, (_, seat) => {
            const person = table?.seats.some((s) => s.playerId === seat) ?? false;
            if (!person) return table?.bots[seat] ?? DEFAULT_BOT;
            return seat === table?.hostId && table.hostBot !== null ? table.hostBot : null;
          });
          const seed = table?.seed ?? view?.seed ?? 0;
          const setup: Setup = { ...common, seed, seats, settings: DEFAULT_SETTINGS };
          const tournament = table?.tournament ?? null;
          void runSession(
            networkSession(
              match,
              connection,
              watching,
              () => match.humanPlayer === hostId,
              () => hostHere,
              () => view?.seats ?? [],
              steam?.inviteBack,
            ),
            setup,
            // The next match is the host's to send from their tournament.
            tournament === null ? {} : { waitLabel: 'tournament.waitHost' },
          ).then(
            (end) => (endMatch = end),
            (e: unknown) => showError(t('error.matchFailed'), e),
          );
        }
        break;
      case 'removed':
        // The host removed this guest (STEAM.md §5): back to the menu, saying so, and no
        // rejoining — the room would refuse it anyway.
        refused = true;
        connection.close();
        showMenu(t('lobby.removed'));
        break;
      case 'error':
        refused = true;
        showError(
          t('error.refused', { code: message.code }),
          refusalText(message.code, message.message),
        );
        break;
      default:
        break;
    }
    steam?.heard(message, started, match.finished, roundOf(match.state));
  });

  // A drop in a match is got back by rejoining the seat, which the server keeps through the
  // match and its summary; in the lobby only while the room holds the seat (S3.6), after which
  // it is anyone's, and the drop the end.
  let droppedAt: number | null = null;
  connection.onMessage((message) => {
    if (message.type === 'welcome') droppedAt = null;
  });
  connection.rejoinWhile(() => {
    if (started) return true;
    const now = Date.now();
    droppedAt ??= now;
    return now - droppedAt < LOBBY_HOLD_MS;
  });
  connection.onLost(() => {
    // In a match the screen says so over the board (`connectionNotice.ts`).
    if (!started && !refused)
      showMenu(
        t(
          connection.ended === 'host_left'
            ? 'connection.hostLeftLobby'
            : connection.ended === 'server_closed'
              ? 'connection.serverClosedLobby'
              : 'connection.lobbyLost',
        ),
      );
  });

  // A Steam avatar arriving draws the lobby again, with it on its seat's card (S3.4).
  const stopAvatars = onAvatars(() => {
    if (connection.state === 'closed') stopAvatars();
    else render();
  });

  // The tower this person chose last, for the room to know before anything is changed.
  connection.send({ type: 'special', special: preferredTower() });

  // The welcome that decided there was a server arrived before this listener did.
  match.receive(welcome);
  roomCode = welcome.code;
  hostId = welcome.hostId;
  store(TOKEN_KEY, `${welcome.code}:${welcome.token}`, 'session');

  // Until the connection closes — left running, every lobby opened in the page went on
  // queueing a ping every two seconds for a socket that would never send them.
  // Under Steam the room's lobby and presence go with the connection, however it closed —
  // the summary's way back to the menu among them.
  const pinging = setInterval(() => {
    if (connection.state === 'closed') {
      clearInterval(pinging);
      leaveSteam();
    } else connection.ping();
  }, 2000);
}

/**
 * The host's tournament as they sent it, and where it stands, or null if it cannot be read:
 * the lobby then has no tournament's tab, only the match.
 */
function readTournament(json: string): { save: Save; progress: Progress } | null {
  try {
    const parsed = parseSave(JSON.parse(json));
    return parsed.ok ? { save: parsed.save, progress: new Progress(parsed.save) } : null;
  } catch {
    return null;
  }
}
