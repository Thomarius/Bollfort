import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfigBundle } from '@bollfort/config/node';
import { startServer } from '@bollfort/server';
import { BrowserWindow, Menu, app, clipboard, ipcMain, screen, shell } from 'electron';

import { cloudflaredBinary } from './cloudflared.js';
import { gameStart } from './devStart.js';
import { ServerControl, nextPort } from './control.js';
import { checkFirewall, type FirewallStatus } from './firewall.js';
import { Tunnel } from './tunnel.js';
import { placeOn, readBounds, showWhenPainted, type Bounds } from './windowPlace.js';

/**
 * The desktop app (PLAN 11.17 A2): the server behind a minimal window, for a host with no
 * Node, repository or terminal. Start and Stop, the addresses to give the other players,
 * Open in browser, and Play here — the game in a window of the app's own. Closing the
 * window stops the server. A packaged app records nothing (STEAM.md, package R): recordings
 * are for tuning, not for players. Run from the repository, it records into a folder of the
 * user's, as before.
 *
 * Where things are differs between running from the repository and running packaged
 * (A3): packaged, the config, the client and the audio are the app's resources.
 */
/** The commit the app was built from, put in by `build.js`; null when it could not tell. */
declare const __BOLLFORT_COMMIT__: string | null;
const BUILT_FROM = __BOLLFORT_COMMIT__;

const here = dirname(fileURLToPath(import.meta.url));
const root = app.isPackaged ? process.resourcesPath : resolve(here, '..', '..', '..');
/**
 * The app's icon, Minimal's B (ARCHIVE 15zo, the user's choice, 2026-11-06): Steam's shortcut
 * icon, the .exe's and the AppImage's (`build.win.icon`, `build.linux.icon`), and the windows'
 * — shipped beside the client at the path it has in the repository, so it is found either way.
 */
const icon = join(root, 'assets', 'store', 'shortcut_icon.png');
/** `--game-params`, and from the repository `--supporter` (`devStart.ts`). */
const start = gameStart(process.argv, app.isPackaged);
const clientDir = app.isPackaged
  ? join(process.resourcesPath, 'client')
  : join(root, 'packages', 'client', start.clientFolder);

// Named, so its data sits in a folder called Bollfort, not @bollfort/desktop.
app.setName('Bollfort');

/** One copy at a time: a second would only find the first's port taken. */
if (!app.requestSingleInstanceLock()) app.quit();

/**
 * The window's remembered choices, "Open to the internet" (PLAN 11.21) and "Share a link
 * online": each off until the host switches it on, then on at every start until they switch
 * it off.
 */
const settingsFile = join(app.getPath('userData'), 'settings.json');
type Switches = { upnp: boolean; tunnel: boolean };
function savedSwitches(): Switches {
  try {
    const saved = JSON.parse(readFileSync(settingsFile, 'utf8')) as Record<string, unknown>;
    return { upnp: saved.upnp === true, tunnel: saved.tunnel === true };
  } catch {
    return { upnp: false, tunnel: false };
  }
}
const switches = savedSwitches();
function saveSwitch(name: keyof Switches, on: boolean): void {
  switches[name] = on;
  try {
    writeFileSync(settingsFile, JSON.stringify(switches));
  } catch {
    // Not remembered: it still applies until the app closes.
  }
}

/**
 * The game window's size and place (PLAN §11 item 10, GL1), in a file of its own so the
 * switches' writing never drops it.
 */
const placeFile = join(app.getPath('userData'), 'window.json');
function savedPlace(): unknown {
  try {
    return JSON.parse(readFileSync(placeFile, 'utf8')) as unknown;
  } catch {
    return null;
  }
}
function savePlace(bounds: Bounds, fullscreen: boolean): void {
  try {
    writeFileSync(placeFile, JSON.stringify({ bounds, fullscreen }));
  } catch {
    // Not remembered: the next window opens centred.
  }
}

const bundle = loadConfigBundle(root);
const control = new ServerControl(
  (port) =>
    startServer({
      root,
      clientDir,
      // Packaged, never recorded; from the repository, into the user's folder.
      record: !app.isPackaged,
      recordingsDir: join(app.getPath('userData'), 'recordings'),
      port,
      // Packaged, there is no repository to ask: the commit is baked in as it was built.
      ...(app.isPackaged ? { commit: BUILT_FROM } : {}),
    }),
  bundle.server.port,
  switches,
  new Tunnel({
    binary: (progress) => cloudflaredBinary(join(app.getPath('userData'), 'cloudflared'), progress),
  }),
);

/**
 * The game first (PLAN §11 item 11, PG2; the user's choice, 2026-11-22): the app starts its server
 * and opens the game's window on it, as a game opens; the server's panel — its addresses for the
 * other players, Open to the internet, Share a link online — comes from the menu's Hosting, or by
 * itself when the server could not start, for the host to try another port. It had opened first,
 * the game behind its Play here, which read as a server tool rather than a game.
 */
let panel: BrowserWindow | null = null;
let game: BrowserWindow | null = null;
/** The port the game's page was loaded from, so a server moved to another loads it afresh. */
let gamePort: number | null = null;
let quitting = false;

/** The server stopped before the app goes, so the port is free after. */
function quitApp(): void {
  if (quitting) return;
  quitting = true;
  void control.stop().finally(() => app.quit());
}

function bringForward(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/** The server's panel, made or brought forward. */
function showPanel(): void {
  if (panel !== null && !panel.isDestroyed()) {
    bringForward(panel);
    return;
  }
  const made = new BrowserWindow({
    width: 440,
    height: 780,
    resizable: false,
    title: 'Bollfort server',
    icon,
    backgroundColor: '#12131c',
    autoHideMenuBar: true,
    webPreferences: { preload: join(here, 'preload.cjs') },
  });
  panel = made;
  void made.loadFile(join(here, '..', 'ui', 'index.html'));
  made.webContents.on('did-finish-load', () => {
    made.webContents.send('state', control.state);
    made.webContents.send('firewall', firewall);
  });
  // Back from Windows' question or its settings: the rules may have changed.
  made.on('focus', () => void readFirewall());
  // Closed beside the game, only the panel goes; as the app's last window, it ends the app.
  made.on('close', (event) => {
    if (quitting || (game !== null && !game.isDestroyed())) return;
    event.preventDefault();
    quitApp();
  });
  made.on('closed', () => {
    if (panel === made) panel = null;
  });
}

/** The game's window on the running server, made, loaded afresh on a new port, or brought forward. */
function openGame(): void {
  const state = control.state;
  if (state.status !== 'running') return;
  const url = `http://localhost:${state.port}/${start.query}`;
  if (game !== null && !game.isDestroyed()) {
    if (gamePort !== state.port) {
      gamePort = state.port;
      void game.loadURL(url);
    }
    bringForward(game);
    return;
  }
  const saved = savedPlace();
  const place = placeOn(
    readBounds(saved),
    screen.getAllDisplays().map((d) => d.workArea),
  );
  const made = new BrowserWindow({
    width: 1400,
    height: 900,
    ...(place ?? {}),
    // Windowed unless the player left it fullscreen (Options' Window, PG2).
    fullscreen: (saved as { fullscreen?: unknown } | null)?.fullscreen === true,
    // Shown once painted (PG1), on the game's title screen rather than an empty frame.
    show: false,
    title: 'Bollfort',
    icon,
    backgroundColor: '#0a0a12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, 'appPreload.cjs'),
      // The app's own window may play sound unasked, so the music starts as the game opens
      // rather than at the first click, as a browser insists (the users' wish, 2026-10-09).
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  game = made;
  // The Credits' links lead off the game, to a licence or an author's page: the
  // person's own browser, not another window of the app.
  made.webContents.setWindowOpenHandler(({ url: link }) => {
    if (/^https?:\/\//.test(link)) void shell.openExternal(link);
    return { action: 'deny' };
  });
  // A game, not a page: no pinching the page larger (GL1).
  void made.webContents.setVisualZoomLevelLimits(1, 1);
  showWhenPainted(made);
  const tell = (on: boolean): void => made.webContents.send('app-fullscreen', on);
  made.on('enter-full-screen', () => tell(true));
  made.on('leave-full-screen', () => tell(false));
  // Where it was left and whether fullscreen, for next time; closing the game ends the app.
  made.on('close', (event) => {
    savePlace(made.getNormalBounds(), made.isFullScreen());
    if (quitting) return;
    event.preventDefault();
    quitApp();
  });
  made.on('closed', () => {
    if (game === made) game = null;
  });
  gamePort = state.port;
  void made.loadURL(url);
}

ipcMain.handle('app-fullscreen', () => game?.isFullScreen() ?? false);
ipcMain.handle('app-set-fullscreen', (_event, on: boolean) => {
  game?.setFullScreen(on === true);
  return on === true;
});
ipcMain.handle('app-quit', () => quitApp());
ipcMain.on('app-hosting', () => showPanel());

/**
 * What Windows Firewall makes of the server, read as it starts and whenever the window comes
 * back to the front; one reading at a time, and an answer for an old port dropped.
 */
let firewall: FirewallStatus = { state: 'unchecked' };
let reading = false;
async function readFirewall(): Promise<void> {
  const state = control.state;
  if (reading || state.status !== 'running') return;
  reading = true;
  try {
    const status = await checkFirewall(process.execPath, state.port);
    if (control.state.status !== 'running' || control.state.port !== state.port) return;
    firewall = status;
    panel?.webContents.send('firewall', firewall);
  } finally {
    reading = false;
  }
}

let wasRunning = false;
control.onChange((state) => {
  if (panel !== null && !panel.isDestroyed()) panel.webContents.send('state', state);
  const running = state.status === 'running';
  if (running && !wasRunning) {
    void readFirewall();
    // The game on it: at the start, and on a new port the host chose in the panel.
    openGame();
  }
  // Not started (a port in use, no permission): the panel, to try another.
  if (state.status === 'failed') showPanel();
  wasRunning = running;
});

ipcMain.handle('start', (_event, port?: number) => control.startOn(port));
ipcMain.handle('stop', () => control.stop());
ipcMain.handle('next-port', () => control.startOn(nextPort(control.state.port)));
ipcMain.handle('set-upnp', (_event, on: boolean) => {
  saveSwitch('upnp', on === true);
  return control.setUpnp(on === true);
});
ipcMain.handle('set-tunnel', (_event, on: boolean) => {
  saveSwitch('tunnel', on === true);
  return control.setTunnel(on === true);
});
ipcMain.handle('copy', (_event, text: string) => clipboard.writeText(text));
ipcMain.handle('open-browser', () => {
  const state = control.state;
  if (state.status === 'running') void shell.openExternal(`http://localhost:${state.port}`);
});
ipcMain.handle('play-here', () => openGame());

app.on('second-instance', () => {
  const front = game ?? panel;
  if (front !== null && !front.isDestroyed()) bringForward(front);
});

void app.whenReady().then(() => {
  // No menu bar for Alt to show, and with it none of its keys: reload, the developer tools, the
  // page's zoom (GL1). From the repository it stays, for the developer tools.
  if (app.isPackaged) Menu.setApplicationMenu(null);
  // Started at once, the game opening on it as it runs (`control.onChange`).
  void control.startOn();
});
