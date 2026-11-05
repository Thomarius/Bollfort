// S1, the Steam spike (docs/STEAM.md §3.3), on App ID 480 (Spacewar). Throwaway: S2 and S3
// build the real thing on what this finds.
//
// The game itself crosses Steam unchanged: the host runs Bollfort's own server, and each guest's
// game page talks to a relay on its own machine, which carries every WebSocket message over
// Steam's old P2P channel (reliable sends) to the host's relay and on to the server. So an
// eight-seat match over Steam is the real game, and every rejoin a guest's page makes is counted
// here: a desync is mended by rejoining (ARCHIVE 15zc), so rejoins in a match without a dropped
// link mean the channel broke the order.

const { app, BrowserWindow, clipboard, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { WebSocketServer, WebSocket } = require('ws');
const steamworks = require('steamworks.js');

const APP_ID = 480;
/** Every developer shares App ID 480: our lobbies carry this key, and only those are listed. */
const TAG = 'bollfort_spike';
const SERVER_PORT = Number(process.env.SPIKE_SERVER_PORT ?? 8090);
const RELAY_PORT = Number(process.env.SPIKE_RELAY_PORT ?? 8091);
const REPO = path.resolve(__dirname, '../..');
// Packaged (the Windows zip from GitHub Actions), the config and the built client travel in
// the app's resources, as the desktop app's do; run from the repository, they are its own.
const PACKAGED = app.isPackaged;
const CONFIG_ROOT = PACKAGED ? process.resourcesPath : REPO;
const CLIENT_DIST = PACKAGED
  ? path.join(process.resourcesPath, 'client')
  : path.join(REPO, 'packages/client/dist');

// Numbers, as steamworks.js's enums are declared `const enum` and may not exist at run time.
const LOBBY_TYPES = { private: 0, friends: 1, public: 2 };
const RELIABLE = 2;
const CB = { lobbyData: 4, lobbyChat: 5, p2pRequest: 6, p2pFail: 7, joinRequested: 8 };
const KIND = { open: 1, data: 2, close: 3, ping: 4, pong: 5 };

// Before the app is ready: the overlay needs its switches set first (in-process GPU).
steamworks.electronEnableSteamOverlay();

const log = [];
let control = null;

// Every line also goes to a file of its own per start, so nothing depends on copying the log
// by hand: in a `logs` folder beside the program, or in the app's data folder where that
// cannot be written.
function openLogFile() {
  const name = `spike-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`;
  const folders = [path.join(path.dirname(process.execPath), 'logs'), app.getPath('userData')];
  if (!PACKAGED) folders.unshift(path.join(__dirname, 'logs'));
  for (const folder of folders) {
    try {
      fs.mkdirSync(folder, { recursive: true });
      const file = path.join(folder, name);
      fs.writeFileSync(file, '');
      return file;
    } catch {
      // the next folder
    }
  }
  return null;
}
const logFile = openLogFile();

/** To the control window while it lives: closing the app destroys it before the server, the
 * relay and the timers below have stopped, and a send then throws "Object has been destroyed". */
function toControl(channel, payload) {
  if (control === null || control.isDestroyed() || control.webContents.isDestroyed()) return;
  control.webContents.send(channel, payload);
}
function say(line) {
  const stamped = `${new Date().toISOString().slice(11, 19)}  ${line}`;
  log.push(stamped);
  console.log(stamped);
  if (logFile !== null) {
    try {
      fs.appendFileSync(logFile, `${stamped}\n`);
    } catch {
      // the window's log still has it
    }
  }
  toControl('log', stamped);
}

// Q6: whether Steam asks us to relaunch through it. With steam_appid.txt beside the app, Steam
// treats it as a developer's build and says no.
let restart = 'not asked';
try {
  restart = String(steamworks.restartAppIfNecessary(APP_ID));
} catch (e) {
  restart = `threw: ${e.message}`;
}

let client = null;
let initError = null;
try {
  client = steamworks.init(APP_ID);
} catch (e) {
  initError = String(e?.message ?? e);
}

const stats = {
  role: 'none',
  lobby: null,
  lobbyType: null,
  room: null,
  members: [],
  rtt: null,
  /** The round trip's highest and its sum over every answered ping, for the mean. */
  rttMax: null,
  rttSum: 0,
  rttCount: 0,
  /** Stretches of more than STALL_MS without an answer from the host, and the longest. */
  stalls: 0,
  longestStallMs: 0,
  sentPackets: 0,
  sentBytes: 0,
  sendFailures: 0,
  readPackets: 0,
  readBytes: 0,
  /** Guest: game-page sockets opened through the relay; host: relayed sockets accepted. */
  socketsOpened: 0,
  socketsOpenedInMatch: 0,
  largestPacket: 0,
};

let lobby = null;
let hostId = null;
const myName = () => (client ? client.localplayer.getName() : 'Player');
/** The name as the game takes it: at most 24 characters (the protocol's limit), never empty. */
const gameName = () => myName().trim().slice(0, 24).trim() || 'Player';
const mySteamId = () => (client ? client.localplayer.getSteamId().steamId64 : 0n);

function state() {
  return {
    ...stats,
    lobby: stats.lobby?.toString() ?? null,
    initError,
    restart,
    name: client ? myName() : null,
    steamId: client ? mySteamId().toString() : null,
    onDeck: client ? client.utils.isSteamRunningOnSteamDeck() : null,
    language: client ? client.apps.currentGameLanguage() : null,
    argv: process.argv.slice(1).join(' '),
    rttMean: stats.rttCount === 0 ? null : Math.round(stats.rttSum / stats.rttCount),
    stallNow: stallSince === null ? 0 : Date.now() - stallSince,
    logFile,
  };
}

/** The State table as text, for the notes: what the control window shows. */
function stateText() {
  const s = state();
  return [
    `Steam user: ${s.name ? `${s.name} (${s.steamId})` : `not initialised: ${s.initError}`}`,
    `restartAppIfNecessary: ${s.restart}`,
    `On a Steam Deck: ${s.onDeck}`,
    `Steam language: ${s.language}`,
    `Started with: ${s.argv}`,
    `Role: ${s.role}`,
    `Lobby: ${s.lobby ? `${s.lobby} (${s.lobbyType ?? 'joined'})` : '-'}`,
    `Room: ${s.room ?? '-'}`,
    `Round trip: now ${s.rtt ?? '-'} ms, highest ${s.rttMax ?? '-'} ms, mean ${s.rttMean ?? '-'} ms (${s.rttCount} pings)`,
    `Host silent > ${STALL_MS / 1000} s: ${s.stalls} times, longest ${(s.longestStallMs / 1000).toFixed(1)} s`,
    `Sent: ${s.sentPackets} packets, ${(s.sentBytes / 1024).toFixed(0)} KB, largest ${s.largestPacket} B, failures ${s.sendFailures}`,
    `Read: ${s.readPackets} packets, ${(s.readBytes / 1024).toFixed(0)} KB`,
    `Sockets opened: ${s.socketsOpened} (in a match: ${s.socketsOpenedInMatch})`,
  ].join('\n');
}
setInterval(() => toControl('state', state()), 500);

// --- P2P framing: [kind u8][connection u32 LE][payload] ---------------------------------------

function frame(kind, conn, payload) {
  const body = payload === undefined ? Buffer.alloc(0) : Buffer.from(payload);
  const head = Buffer.alloc(5);
  head.writeUInt8(kind, 0);
  head.writeUInt32LE(conn, 1);
  return Buffer.concat([head, body]);
}

function send(to, kind, conn, payload) {
  // No host any more (a page's socket closing after the lobby was left): nowhere to send.
  if (to === null || client === null) return;
  const packet = frame(kind, conn, payload);
  const ok = client.networking.sendP2PPacket(to, RELIABLE, packet);
  stats.sentPackets++;
  stats.sentBytes += packet.length;
  stats.largestPacket = Math.max(stats.largestPacket, packet.length);
  if (!ok) {
    stats.sendFailures++;
    say(`send failed: kind ${kind}, ${packet.length} bytes to ${to}`);
  }
}

/** Read every packet waiting, often: a commit thirty times a second must not wait on a timer. */
function poll() {
  if (client === null) return;
  for (;;) {
    const size = client.networking.isP2PPacketAvailable();
    if (!size) return;
    const packet = client.networking.readP2PPacket(size);
    stats.readPackets++;
    stats.readBytes += packet.size;
    const from = packet.steamId.steamId64;
    const data = packet.data;
    const kind = data.readUInt8(0);
    const conn = data.readUInt32LE(1);
    const payload = data.subarray(5);
    if (stats.role === 'host') onHostPacket(from, kind, conn, payload);
    else if (stats.role === 'guest') onGuestPacket(kind, conn, payload);
  }
}
setInterval(poll, 2);

// --- The host: the real server, and a socket to it for each guest's page -------------------------

const relayed = new Map(); // `${steamId}:${conn}` -> { ws, queue }
let running = null;

function get(url) {
  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(res.statusCode === 200 ? body : null));
      })
      .on('error', () => resolve(null));
  });
}

async function ensureServer() {
  if (running !== null) return;
  // The game's own server, bundled into the spike (build.mjs) and started inside it, as the
  // desktop app starts it: on this machine only, guests reaching it through Steam.
  const { startServer } = await import(
    pathToFileURL(path.join(__dirname, 'dist', 'server.mjs')).href
  );
  const result = await startServer({
    root: CONFIG_ROOT,
    clientDir: CLIENT_DIST,
    port: SERVER_PORT,
    host: '127.0.0.1',
    // A packaged build never records (STEAM.md package R); from the repository, as npm start.
    record: !PACKAGED,
    commit: null,
    log: (line) => say(`server: ${line}`),
  });
  if (!result.ok) throw new Error(`the server could not start: ${result.reason} on ${result.port}`);
  running = result.server;
  say(`server on ${SERVER_PORT}, serving ${CLIENT_DIST}`);
}

function isMember(steamId) {
  return lobby !== null && lobby.getMembers().some((m) => m.steamId64 === steamId);
}

function onHostPacket(from, kind, conn, payload) {
  if (kind === KIND.ping) {
    send(from, KIND.pong, conn, payload);
    return;
  }
  const key = `${from}:${conn}`;
  if (kind === KIND.open) {
    if (!isMember(from)) {
      say(`refused a socket from ${from}: not in the lobby`);
      return;
    }
    const ws = new WebSocket(`ws://127.0.0.1:${SERVER_PORT}`);
    const entry = { ws, queue: [] };
    relayed.set(key, entry);
    stats.socketsOpened++;
    if (stats.room !== null && matchStarted) stats.socketsOpenedInMatch++;
    say(`guest ${from} opened socket ${conn}`);
    ws.on('open', () => {
      for (const text of entry.queue) ws.send(text);
      entry.queue = [];
    });
    ws.on('message', (data) => send(from, KIND.data, conn, String(data)));
    ws.on('close', () => {
      relayed.delete(key);
      send(from, KIND.close, conn);
    });
    ws.on('error', (e) => say(`relayed socket ${key}: ${e.message}`));
    return;
  }
  const entry = relayed.get(key);
  if (entry === undefined) return;
  if (kind === KIND.data) {
    const text = payload.toString('utf8');
    if (entry.ws.readyState === WebSocket.OPEN) entry.ws.send(text);
    else entry.queue.push(text);
  } else if (kind === KIND.close) {
    entry.ws.close();
    relayed.delete(key);
  }
}

/** Whether the host's room has left its lobby: no longer listed as open. */
let matchStarted = false;

async function watchRoom() {
  // The room the host's page made: the newest open one hosted under this Steam name.
  for (;;) {
    if (stats.role !== 'host' || lobby === null) return;
    const body = await get(`http://127.0.0.1:${SERVER_PORT}/api/rooms`);
    const rooms = body === null ? [] : JSON.parse(body).rooms;
    const mine = rooms.filter((r) => r.host === gameName()).at(-1);
    if (mine !== undefined && mine.code !== stats.room) {
      stats.room = mine.code;
      lobby.setData('room', mine.code);
      say(`room ${mine.code} published in the lobby`);
    }
    // Listed no longer: the match is under way; Steam's lobby is closed to joins (§7.2).
    if (stats.room !== null && mine === undefined && !matchStarted) {
      matchStarted = true;
      lobby.setJoinable(false);
      say('match started: lobby closed to joins');
    }
    if (stats.room !== null && mine !== undefined && matchStarted) {
      matchStarted = false;
      lobby.setJoinable(true);
      say('back in the lobby: open to joins again');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function host(type) {
  await ensureServer();
  lobby = await client.matchmaking.createLobby(LOBBY_TYPES[type], 8);
  stats.role = 'host';
  stats.lobby = lobby.id;
  stats.lobbyType = type;
  hostId = mySteamId();
  lobby.mergeFullData({ [TAG]: '1', host: myName(), protocol: 'spike' });
  client.localplayer.setRichPresence('connect', `+connect_lobby ${lobby.id}`);
  client.localplayer.setRichPresence('steam_display', '#Status_InLobby');
  say(`lobby ${lobby.id} made (${type})`);
  openGame(`http://127.0.0.1:${SERVER_PORT}/?host=8&name=${encodeURIComponent(gameName())}`);
  void watchRoom();
}

// --- A guest: the game page served here, its socket carried to the host -------------------------

const pageSockets = new Map(); // conn -> ws
let nextConn = 1;
let relayServer = null;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

function ensureRelay() {
  if (relayServer !== null) return;
  relayServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // The games browser asks the server for open rooms: none here, it is Steam's to list.
    if (url.pathname === '/api/rooms') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ protocol: -1, rooms: [] }));
      return;
    }
    let file = path.join(CLIENT_DIST, path.normalize(url.pathname));
    if (!file.startsWith(CLIENT_DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
      file = path.join(CLIENT_DIST, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  const wss = new WebSocketServer({ server: relayServer });
  wss.on('connection', (ws) => {
    const conn = nextConn++;
    pageSockets.set(conn, ws);
    stats.socketsOpened++;
    if (inMatch) stats.socketsOpenedInMatch++;
    say(`page socket ${conn} opened${inMatch ? ' DURING A MATCH (a rejoin)' : ''}`);
    send(hostId, KIND.open, conn);
    ws.on('message', (data) => {
      const text = String(data);
      if (text.includes('"type":"start"') || text.includes('"type":"action"')) inMatch = true;
      send(hostId, KIND.data, conn, text);
    });
    ws.on('close', () => {
      pageSockets.delete(conn);
      send(hostId, KIND.close, conn);
    });
  });
  relayServer.listen(RELAY_PORT, '127.0.0.1', () => say(`relay serving the game on ${RELAY_PORT}`));
}

/** Set once the guest's page has played: from then on a new socket is a rejoin. */
let inMatch = false;

function onGuestPacket(kind, conn, payload) {
  if (kind === KIND.pong) {
    const rtt = Number(process.hrtime.bigint() / 1000000n - payload.readBigUInt64LE(0));
    stats.rtt = rtt;
    stats.rttMax = Math.max(stats.rttMax ?? 0, rtt);
    stats.rttSum += rtt;
    stats.rttCount++;
    lastAnswer = Date.now();
    if (stallSince !== null) {
      const ms = lastAnswer - stallSince;
      stats.longestStallMs = Math.max(stats.longestStallMs, ms);
      say(`the host answers again, after ${(ms / 1000).toFixed(1)} s without an answer`);
      stallSince = null;
    }
    return;
  }
  const ws = pageSockets.get(conn);
  if (ws === undefined) return;
  if (kind === KIND.data) {
    const text = payload.toString('utf8');
    // A snapshot or a commit means a match is on.
    if (text.startsWith('{"type":"snapshot"') || text.startsWith('{"type":"commit"'))
      inMatch = true;
    ws.send(text);
  } else if (kind === KIND.close) ws.close();
}

/** No answer from the host for this long counts as the host gone silent (the outage test). */
const STALL_MS = 3000;
/** When the host last answered a ping, and the last answer before a silence under way. */
let lastAnswer = null;
let stallSince = null;

// The round trip over Steam, a ping a second: our own clock out and back.
setInterval(() => {
  if (stats.role !== 'guest' || hostId === null) return;
  if (lastAnswer !== null && stallSince === null && Date.now() - lastAnswer > STALL_MS) {
    stallSince = lastAnswer;
    stats.stalls++;
    say(`the host has not answered for ${STALL_MS / 1000} s`);
  }
  const t = Buffer.alloc(8);
  t.writeBigUInt64LE(process.hrtime.bigint() / 1000000n);
  send(hostId, KIND.ping, 0, t);
}, 1000);

async function join(id) {
  if (lobby !== null) {
    say('already in a lobby: Restart clean first');
    return;
  }
  lobby = await client.matchmaking.joinLobby(BigInt(id));
  stats.role = 'guest';
  stats.lobby = lobby.id;
  hostId = lobby.getOwner().steamId64;
  say(`joined lobby ${lobby.id}, hosted by ${hostId}`);
  ensureRelay();
  for (let i = 0; i < 120; i++) {
    const room = lobby.getData('room');
    if (room) {
      stats.room = room;
      openGame(
        `http://127.0.0.1:${RELAY_PORT}/?join=${room}&name=${encodeURIComponent(gameName())}`,
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  say('the lobby never named a room');
}

// --- Windows ----------------------------------------------------------------------------------

let game = null;
function openGame(url) {
  game?.close();
  game = new BrowserWindow({ width: 1280, height: 800, title: `Bollfort (spike) — ${stats.role}` });
  game.loadURL(url);
  game.on('closed', () => (game = null));
  // The game page's warnings and errors in the spike's log, so a failure inside the game is
  // in the notes too. Electron 44 hands the details on the event.
  game.webContents.on('console-message', (event, level, message) => {
    const lvl = event.level ?? ['verbose', 'info', 'warning', 'error'][level];
    const text = event.message ?? message;
    if (lvl === 'warning' || lvl === 'error') say(`game ${lvl}: ${text}`);
  });
  game.webContents.on('render-process-gone', (_e, details) =>
    say(`game window's page gone: ${details.reason}`),
  );
  say(`game window: ${url}`);
}

app.whenReady().then(() => {
  control = new BrowserWindow({
    width: 760,
    height: 900,
    title: 'Bollfort Steam spike',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  control.loadFile(path.join(__dirname, 'control.html'));
  control.webContents.on('did-finish-load', () => {
    for (const line of log) toControl('log', line);
  });
  control.on('closed', () => (control = null));

  // The notes' helpers, there whether Steam started or not.
  ipcMain.handle('copy', () => {
    clipboard.writeText([stateText(), '', ...log, ''].join('\n'));
    say('state and log copied to the clipboard');
  });
  ipcMain.handle('note', (_e, text) => {
    // A mark carries the State table with it, so every step's figures are in the log file.
    const line = String(text ?? '').trim() || 'mark';
    say(`=== ${line} ===\n${stateText()}`);
  });
  ipcMain.handle('restart', () => restartClean());
  say(`log file: ${logFile ?? 'none (no folder could be written)'}`);

  if (client === null) {
    say(`Steam did not initialise: ${initError}. Is Steam running and logged in?`);
    return;
  }
  say(`Steam: ${myName()} (${mySteamId()}), restartAppIfNecessary(480) = ${restart}`);

  client.callback.register(CB.p2pRequest, ({ remote }) => {
    // Only lobby members may open a session with the host.
    if (isMember(remote) || remote === hostId) {
      client.networking.acceptP2PSession(remote);
      say(`P2P session accepted from ${remote}`);
    } else say(`P2P session from ${remote} ignored: not in the lobby`);
  });
  client.callback.register(CB.p2pFail, ({ remote, error }) =>
    say(`P2P session with ${remote} failed: error ${error}`),
  );
  client.callback.register(CB.lobbyChat, ({ user_changed, member_state_change }) => {
    const what = ['entered', 'left', 'disconnected', 'was kicked', 'was banned'][
      member_state_change
    ];
    say(`lobby: ${user_changed} ${what}`);
    if (lobby !== null) stats.members = lobby.getMembers().map((m) => m.steamId64.toString());
  });
  // Q5, the game running: an invite accepted, or Join chosen in the friends list.
  client.callback.register(CB.joinRequested, ({ lobby_steam_id, friend_steam_id }) => {
    say(`GameLobbyJoinRequested: lobby ${lobby_steam_id} from friend ${friend_steam_id}`);
    void join(lobby_steam_id).catch((e) => say(`join failed: ${e.message}`));
  });

  // Q5, the game closed: Steam starts it with +connect_lobby <id>.
  const at = process.argv.indexOf('+connect_lobby');
  if (at >= 0 && process.argv[at + 1]) {
    say(`started with +connect_lobby ${process.argv[at + 1]}`);
    void join(process.argv[at + 1]).catch((e) => say(`join failed: ${e.message}`));
  }

  ipcMain.handle('host', (_e, type) => host(type).catch((e) => say(`host failed: ${e.message}`)));
  ipcMain.handle('join', (_e, id) => join(id).catch((e) => say(`join failed: ${e.message}`)));
  ipcMain.handle('invite', () => {
    if (lobby === null) return say('no lobby to invite to');
    lobby.openInviteDialog();
    say('invite dialog asked for (lobby.openInviteDialog)');
  });
  ipcMain.handle('overlayInvite', () => {
    if (lobby === null) return say('no lobby to invite to');
    client.overlay.activateInviteDialog(lobby.id);
    say('invite dialog asked for (overlay.activateInviteDialog)');
  });
  ipcMain.handle('friends', () => client.overlay.activateDialog(0));
  ipcMain.handle('list', async () => {
    const all = await client.matchmaking.getLobbies();
    const ours = all.filter((l) => l.getData(TAG) === '1');
    say(`getLobbies: ${all.length} lobbies on 480, ${ours.length} of ours`);
    return ours.map((l) => ({
      id: l.id.toString(),
      host: l.getData('host'),
      members: Number(l.getMemberCount()),
    }));
  });
  ipcMain.handle('keyboard', async () => {
    const typed = await client.utils.showGamepadTextInput(0, 0, 'Your name', 16, myName());
    say(`showGamepadTextInput returned ${JSON.stringify(typed)}`);
  });
  ipcMain.handle('state', () => state());
});

/** The State table into the log, as the spike quits or restarts: the last figures kept. */
function sayState(why) {
  say(`state ${why}:\n${stateText()}`);
}

/**
 * Quit and start again with nothing left over: no lobby, no server, no game window, every
 * counter at zero. Leaving a lobby in place kept the old room and its sockets, so a test that
 * needs a fresh start gets a fresh process.
 */
async function restartClean() {
  sayState('before the restart');
  try {
    lobby?.leave();
    client?.localplayer.setRichPresence('connect', null);
  } catch (e) {
    say(`leaving the lobby: ${e.message}`);
  }
  game?.destroy();
  if (running !== null)
    await Promise.race([running.stop(), new Promise((r) => setTimeout(r, 2000))]);
  // Started by an invite: the restart must not join that lobby again.
  const args = process.argv.slice(1);
  const at = args.indexOf('+connect_lobby');
  if (at >= 0) args.splice(at, 2);
  app.relaunch({ args });
  app.exit(0);
}

app.on('window-all-closed', () => {
  sayState('at quit');
  lobby?.leave();
  void running?.stop();
  app.quit();
});
