import { createRequire } from 'node:module';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfigBundle } from '@bollfort/config/node';
import { startServer, type RunningServer } from '@bollfort/server';
import { BrowserWindow, app, ipcMain, shell } from 'electron';
import type * as Steamworks from 'steamworks.js';

import {
  NO_STEAM,
  STEAM_APP_ID,
  savedFullscreen,
  serverPorts,
  startPlan,
  type SteamInfo,
} from './steam.js';

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

/** Steam set up, or null when Steam is starting the app again itself (Q6). */
function initSteam(): SteamInfo | null {
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
      ready: true,
      name: client.localplayer.getName(),
      steamId: client.localplayer.getSteamId().steamId64.toString(),
      language: client.apps.currentGameLanguage(),
      error: null,
    };
  } catch (e) {
    // Steam not running: the game plays locally, and the menu says online play needs Steam.
    return { ...NO_STEAM, error: String((e as Error).message ?? e) };
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

async function startOwnServer(): Promise<RunningServer> {
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
    });
    if (result.ok) return result.server;
  }
  throw new Error('no free port for the game');
}

async function run(): Promise<void> {
  log(`started (${process.pid}): ${process.argv.slice(1).join(' ')}`, true);
  const steam = initSteam();
  if (steam === null) return;
  log(steam.ready ? `Steam ready: ${steam.name}` : `no Steam: ${steam.error}`);
  let window: BrowserWindow | null = null;
  let server: RunningServer | null = null;
  let quitting = false;

  ipcMain.handle('host-steam', () => steam);
  ipcMain.handle('host-lobbies', () => lobbiesAsked.splice(0));
  ipcMain.handle('host-fullscreen', () => window?.isFullScreen() ?? false);
  ipcMain.handle('host-set-fullscreen', (_event, on: boolean) =>
    window?.setFullScreen(on === true),
  );

  app.on('second-instance', (_event, argv) => {
    const lobby = startPlan(process.platform, argv, STEAM_APP_ID).connectLobby;
    if (lobby !== null) lobbiesAsked.push(lobby);
    if (window === null) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  await app.whenReady();
  log('app ready');
  server = await startOwnServer();
  log(`server on ${server.port}`);
  // The first window made, and the only one: on Windows the overlay draws in the first
  // (STEAM.md §3.3). Fullscreen at the window, not the page's: Esc, the game's pause, would
  // otherwise leave it.
  window = new BrowserWindow({
    width: 1400,
    height: 900,
    fullscreen: savedFullscreen(readSettings()),
    title: 'Bollfort',
    icon,
    backgroundColor: '#0a0a12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, 'gamePreload.cjs'),
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  const tell = (): void => window?.webContents.send('host-fullscreen', window.isFullScreen());
  window.on('enter-full-screen', () => {
    saveFullscreen(true);
    tell();
  });
  window.on('leave-full-screen', () => {
    saveFullscreen(false);
    tell();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Closing the window ends the app, the server first, so its port is free after.
  const quit = (): void => {
    if (quitting) return;
    quitting = true;
    void (server?.stop() ?? Promise.resolve()).finally(() => app.exit(0));
  };
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
  log('window made');
  void window.loadURL(`http://127.0.0.1:${server.port}`);
}
