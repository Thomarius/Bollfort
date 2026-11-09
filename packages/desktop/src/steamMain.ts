import { createRequire } from 'node:module';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfigBundle } from '@bollfort/config/node';
import { startServer, type RunningServer } from '@bollfort/server';
import { BrowserWindow, app, ipcMain, shell } from 'electron';
import type * as Steamworks from 'steamworks.js';
import type { callback } from 'steamworks.js/client.js';

import {
  NO_STEAM,
  STEAM_APP_ID,
  savedFullscreen,
  serverPorts,
  startPlan,
  type SteamInfo,
} from './steam.js';
import { PageLinks, type PageLinkEvent } from './pageLinks.js';
import { AvatarWatch, steamAvatarSource } from './steamAvatars.js';
import { startSteamNet, type SteamNet } from './steamNet.js';

/**
 * The Steam build (STEAM.md §3.5, S2): no launcher, the game's window first and only, its
 * server in the background on this machine alone. Built with `BOLLFORT_STEAM=1`; without it
 * `entry.ts` never reaches this file and `steamworks.js` is never loaded. Lobbies, invites,
 * names and avatars are S3's (§7).
 */
declare const __BOLLFORT_COMMIT__: string | null;

const here = dirname(fileURLToPath(import.meta.url));
const root = app.isPackaged ? process.resourcesPath : resolve(here, '..', '..', '..');
const icon = join(root, 'assets', 'store', 'shortcut_icon.png');
const clientDir = app.isPackaged
  ? join(process.resourcesPath, 'client')
  : join(root, 'packages', 'client', 'dist');

app.setName('Bollfort');

const plan = startPlan(process.platform, process.argv, STEAM_APP_ID);

/**
 * The start's steps, with the time since the process began, in `start.log` beside the
 * settings: what a player can send when the game does not come up. Begun afresh by the start
 * that runs the game; a start turned away, or one starting itself again, only adds a line.
 */
const began = Date.now();
let logStarted = false;
function log(line: string, fresh = false): void {
  try {
    const file = join(app.getPath('userData'), 'start.log');
    if (fresh && !logStarted) {
      mkdirSync(app.getPath('userData'), { recursive: true });
      writeFileSync(file, '');
      logStarted = true;
    }
    appendFileSync(file, `${((Date.now() - began) / 1000).toFixed(2)} s  ${line}\n`);
  } catch {
    // Nowhere to write: the start goes on.
  }
}

if (!app.requestSingleInstanceLock()) {
  // One at a time, before Steam is touched: two on one Steam client read each other's
  // packets, and one crashed (STEAM.md §3.3). A second start hands its invite to the first
  // (`second-instance`) and quits, sandbox or not.
  log(`another start is running: handed over and quit (${process.pid})`);
  app.exit(0);
} else if (plan.relaunch) {
  // Linux without the switch on the command line: again with it, before anything else. The
  // lock goes as this one exits, and the new one takes it.
  log(`starting again with --no-sandbox (${process.pid})`);
  app.releaseSingleInstanceLock();
  app.relaunch({ args: [...process.argv.slice(1), '--no-sandbox'] });
  app.exit(0);
} else {
  void run();
}

/** Lobbies handed on by a second start or the command line, for S3's joining. */
const lobbiesAsked: string[] = plan.connectLobby === null ? [] : [plan.connectLobby];

type SteamClient = ReturnType<typeof Steamworks.init>;

/**
 * Steam set up, with its client for the P2P and avatars (S3), or null when Steam is starting
 * the app again itself (Q6). Returned, not kept in a module variable: `run` starts above the
 * declarations, and a variable declared below was set by it, then reset by its own `= null`.
 */
function initSteam(): { info: SteamInfo; client: SteamClient | null } | null {
  // Loaded only here: a native module, shipped unpacked, in the Steam build alone.
  const steamworks = createRequire(import.meta.url)('steamworks.js') as typeof Steamworks;
  try {
    if (plan.restartCheck && steamworks.restartAppIfNecessary(STEAM_APP_ID)) {
      app.exit(0);
      return null;
    }
  } catch {
    // No Steam to ask: start, and say so below.
  }
  // Before the app is ready: the overlay needs its switches set first (in-process GPU).
  steamworks.electronEnableSteamOverlay();
  try {
    const client = steamworks.init(STEAM_APP_ID);
    return {
      client,
      info: {
        ready: true,
        name: client.localplayer.getName(),
        steamId: client.localplayer.getSteamId().steamId64.toString(),
        language: client.apps.currentGameLanguage(),
        error: null,
      },
    };
  } catch (e) {
    // Steam not running: the game plays locally, and the menu says online play needs Steam.
    return { client: null, info: { ...NO_STEAM, error: String((e as Error).message ?? e) } };
  }
}

/** The window's remembered choice, beside the launcher's in the same folder. */
const settingsFile = (): string => join(app.getPath('userData'), 'steam.json');
function readSettings(): unknown {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf8')) as unknown;
  } catch {
    return null;
  }
}
function saveFullscreen(on: boolean): void {
  try {
    writeFileSync(settingsFile(), JSON.stringify({ fullscreen: on }));
  } catch {
    // Not remembered: it still holds until the app closes.
  }
}

async function startOwnServer(steamId: string | null): Promise<RunningServer> {
  const bundle = loadConfigBundle(root);
  for (const port of serverPorts(bundle.server.port)) {
    const result = await startServer({
      root,
      clientDir,
      // On this machine alone: guests come through Steam (S3), never the network.
      host: '127.0.0.1',
      port,
      // Never recorded in a packaged build (package R); from the repository, as npm start.
      record: !app.isPackaged,
      recordingsDir: join(app.getPath('userData'), 'recordings'),
      ...(app.isPackaged ? { commit: __BOLLFORT_COMMIT__ } : {}),
      // A socket here is the host's own page: it sits as the host's Steam ID (STEAM.md §7.3).
      ...(steamId === null ? {} : { localSteamId: steamId }),
    });
    if (result.ok) return result.server;
  }
  throw new Error('no free port for the game');
}

async function run(): Promise<void> {
  log(`started (${process.pid}): ${process.argv.slice(1).join(' ')}`, true);
  const started = initSteam();
  if (started === null) return;
  const steam = started.info;
  const steamClient = started.client;
  log(steam.ready ? `Steam ready: ${steam.name}` : `no Steam: ${steam.error}`);
  let window: BrowserWindow | null = null;
  let server: RunningServer | null = null;
  let net: SteamNet | null = null;
  let links: PageLinks | null = null;
  let quitting = false;
  const quit = (): void => {
    if (quitting) return;
    quitting = true;
    net?.stop();
    void (server?.stop() ?? Promise.resolve()).finally(() => app.exit(0));
  };

  ipcMain.handle('host-steam', () => steam);
  ipcMain.handle('host-lobbies', () => lobbiesAsked.splice(0));
  /**
   * The window's fullscreen as last set or reported. On Windows the window does not yet say
   * it is fullscreen as the page first asks, and the page's button ran one click behind
   * (2026-11-09): the state set is the answer, the window's events correct it after.
   */
  let full = savedFullscreen(readSettings());
  ipcMain.handle('host-fullscreen', () => full);
  ipcMain.handle('host-set-fullscreen', (_event, on: boolean) => {
    full = on === true;
    window?.setFullScreen(full);
    saveFullscreen(full);
    return full;
  });
  ipcMain.handle('host-quit', () => quit());

  // The page's links to other hosts over Steam (S3.1): opened, sent on and closed by the page's
  // own numbers, what they say sent back to it. Without Steam every link fails at once.
  const tellPage = (event: PageLinkEvent): void => {
    if (window !== null && !window.isDestroyed()) window.webContents.send('steam-link', event);
  };
  ipcMain.on('steam-link-open', (_event, id: number, host: string) => {
    if (links !== null) links.open(id, host);
    else {
      tellPage({ id, event: 'error' });
      tellPage({ id, event: 'close' });
    }
  });
  ipcMain.on('steam-link-send', (_event, id: number, text: string) => links?.send(id, text));
  ipcMain.on('steam-link-close', (_event, id: number) => links?.close(id));
  ipcMain.handle('host-steam-stats', () => net?.stats() ?? null);

  // Players' avatars (S3.4): the page asks for a Steam ID's, and is sent it as Steam has it
  // and again whenever it changes; nothing without Steam, or if the FFI will not open.
  let avatars: AvatarWatch | null = null;
  ipcMain.on('steam-avatar-want', (_event, steamId: unknown) => {
    if (typeof steamId === 'string' && /^\d{1,20}$/.test(steamId)) avatars?.want(steamId);
  });

  app.on('second-instance', (_event, argv) => {
    const lobby = startPlan(process.platform, argv, STEAM_APP_ID).connectLobby;
    if (lobby !== null) lobbiesAsked.push(lobby);
    if (window === null) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  await app.whenReady();
  log('app ready');
  server = await startOwnServer(steam.steamId);
  log(`server on ${server.port}`);
  if (steamClient !== null && steam.ready) {
    const running = server;
    const p2p = startSteamNet(steamClient, (peer, steamId) => running.accept(peer, steamId), log);
    net = p2p;
    links = new PageLinks((host, events) => p2p.guest.dial(host, events), tellPage);
    log('Steam P2P ready');
    try {
      const watch = new AvatarWatch(steamAvatarSource(), (steamId, avatar) => {
        if (window === null || window.isDestroyed()) return;
        window.webContents.send('steam-avatar', { steamId, avatar });
      });
      steamClient.callback.register(
        0 as callback.SteamCallback.PersonaStateChange,
        ({ steam_id }) => watch.personaChanged(steam_id.toString()),
      );
      avatars = watch;
    } catch (e) {
      log(`no avatars: ${(e as Error).message}`);
    }
  }
  // The first window made, and the only one: on Windows the overlay draws in the first
  // (STEAM.md §3.3). Fullscreen at the window, not the page's: Esc, the game's pause, would
  // otherwise leave it.
  window = new BrowserWindow({
    width: 1400,
    height: 900,
    fullscreen: full,
    title: 'Bollfort',
    icon,
    backgroundColor: '#0a0a12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, 'gamePreload.cjs'),
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  const tell = (on: boolean): void => {
    full = on;
    saveFullscreen(on);
    window?.webContents.send('host-fullscreen', on);
  };
  window.on('enter-full-screen', () => tell(true));
  window.on('leave-full-screen', () => tell(false));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Closing the window ends the app, the server first, so its port is free after.
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    quit();
  });
  // Steam stops a game by SIGTERM on Linux (its library's Stop): the same quick end as a
  // closed window, where the app had gone on past 30 s (2026-11-09).
  process.on('SIGTERM', () => {
    log('SIGTERM: quitting');
    quit();
  });
  window.webContents.once('did-finish-load', () => log('game page loaded'));
  // A page loaded again has none of its links: close them, the hosts told.
  window.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) links?.closeAll();
  });
  log('window made');
  void window.loadURL(`http://127.0.0.1:${server.port}`);
}
