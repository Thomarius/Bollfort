// The spike's single-machine checks, run unattended on one Steam account (README "Automated
// part"): everything that needs no second account. Drives the packaged spike through its control
// window with Playwright, as a person would press its buttons, and writes a report.
//
//   node spike/steam/auto.mjs [--app DIR] [--out DIR] [--only a,b] [--skip a,b] [--steam-restart]
//
// Checks: start (Q1, Q6), sockets (no firewall prompt), lobbies (each type hosted, the game's
// lobby opens, the room published, and whether our own lobby is listed), overlay (Q2: injected,
// opened by Shift+Tab and by the API, and the invite dialogs, as screenshots of the desktop),
// connect (the +connect_lobby path), match (a whole eight-seat match on the spike's own server,
// the host idle, seven bots), nosteam (Steam shut down: the spike says so and does not crash; only
// with --steam-restart, which shuts Steam down and starts it again).
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { _electron as electron } from 'playwright-core';

const here = import.meta.dirname;
const WIN = process.platform === 'win32';
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const APP_DIR = path.resolve(
  opt('app', path.join(here, 'release', WIN ? 'win-unpacked' : 'linux-unpacked')),
);
const EXE = path.join(APP_DIR, WIN ? 'BollfortSteamSpike.exe' : 'bollfort-steam-spike');
const STAMP = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const OUT = path.resolve(opt('out', path.join(here, 'auto-results', STAMP)));
const ALL = ['start', 'sockets', 'lobbies', 'overlay', 'connect', 'match', 'nosteam'];
const only = opt('only', null)?.split(',') ?? null;
const skip = opt('skip', '').split(',');
const STEPS = ALL.filter(
  (s) =>
    (only === null || only.includes(s)) &&
    !skip.includes(s) &&
    (s !== 'nosteam' || flag('steam-restart') || only?.includes('nosteam')),
);
const MATCH_MINUTES = Number(opt('match-minutes', 40));

fs.mkdirSync(OUT, { recursive: true });
const results = [];
function record(step, check, ok, detail = '') {
  const mark = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'NOTE';
  results.push({ step, check, result: mark, detail: String(detail) });
  console.log(`[${mark}] ${step}: ${check}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- The spike, driven ----------------------------------------------------------------------

class Spike {
  static async launch(extra = []) {
    const s = new Spike();
    s.log = [];
    s.app = await electron.launch({
      executablePath: EXE,
      args: extra,
      cwd: APP_DIR,
      timeout: 60_000,
    });
    s.pid = s.app.process().pid;
    s.app
      .process()
      .stdout?.on('data', (d) => s.log.push(...String(d).split(/\r?\n/).filter(Boolean)));
    s.control = await s.app.firstWindow();
    await s.control.waitForLoadState('domcontentloaded');
    await s.control.evaluate(() => window.spike.onState((st) => (window.__state = st)));
    s.file = (await s.state())?.logFile ?? null;
    return s;
  }
  /** The spike's own log file, which also holds the lines from before stdout was read. */
  lines() {
    try {
      if (this.file) return fs.readFileSync(this.file, 'utf8').split(/\r?\n/);
    } catch {
      // stdout's, below
    }
    return this.log;
  }
  async state() {
    for (let i = 0; i < 20; i++) {
      const st = await this.control.evaluate(() => window.__state ?? null);
      if (st !== null) return st;
      await sleep(250);
    }
    return null;
  }
  call(name, ...a) {
    return this.control.evaluate(([n, a]) => window.spike[n](...a), [name, a]);
  }
  async waitLog(re, ms = 30_000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const line = this.lines().find((l) => re.test(l));
      if (line) return line;
      await sleep(200);
    }
    return null;
  }
  async gameWindow(ms = 30_000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const w = this.app.windows().find((p) => p !== this.control);
      if (w) return w;
      await sleep(200);
    }
    return null;
  }
  note(text) {
    return this.call('note', `auto: ${text}`);
  }
  async close() {
    try {
      await this.note('closing');
      await Promise.race([this.app.close(), sleep(10_000)]);
    } catch {
      // already gone
    }
    // The whole tree: a spike whose control window was closed by hand outlived app.close() and
    // kept the server's port, and the next check could not host (2026-11-07).
    for (const pid of processTree(this.pid))
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // gone
      }
    await waitPortFree();
  }
}

/** The server's port free again, so the next spike can host. */
async function waitPortFree() {
  for (let i = 0; i < 30; i++) {
    const busy = WIN
      ? /127\.0\.0\.1:8090\s+0\.0\.0\.0:0/.test(
          execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' }),
        )
      : (spawnSync('ss', ['-ltnH', 'sport = :8090'], { encoding: 'utf8' }).stdout ?? '').trim() !==
        '';
    if (!busy) return;
    await sleep(1000);
  }
  console.log('Warning: port 8090 still in use; is another spike running?');
}

function keepLog(spike, name) {
  fs.writeFileSync(path.join(OUT, `${name}.log`), spike.lines().join('\n') + '\n');
}

// --- The desktop, outside the browser: screenshots, keys, processes ------------------------

function screenshot(name) {
  const file = path.join(OUT, `${name}.png`);
  try {
    if (WIN) {
      const ps = [
        'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
        '$b=[System.Windows.Forms.SystemInformation]::VirtualScreen',
        '$i=New-Object System.Drawing.Bitmap $b.Width,$b.Height',
        '$g=[System.Drawing.Graphics]::FromImage($i)',
        '$g.CopyFromScreen($b.Left,$b.Top,0,0,$i.Size)',
        `$i.Save('${file}')`,
      ].join(';');
      execFileSync('powershell.exe', ['-NoProfile', '-Command', ps]);
    } else {
      const tools = [
        ['gnome-screenshot', ['-f', file]],
        ['spectacle', ['-b', '-n', '-f', '-o', file]],
        ['grim', [file]],
        ['import', ['-window', 'root', file]],
        ['scrot', ['-o', file]],
      ];
      for (const [cmd, a] of tools)
        if (spawnSync(cmd, a, { stdio: 'ignore' }).status === 0 && fs.existsSync(file)) break;
    }
  } catch {
    // reported below
  }
  return fs.existsSync(file) ? path.basename(file) : null;
}

/** Shift+Tab as the system's own input, which the overlay hooks; CDP's keys never reach it. */
function shiftTab() {
  if (WIN)
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      "$w=New-Object -ComObject WScript.Shell; $w.SendKeys('+{TAB}')",
    ]);
  else spawnSync('xdotool', ['key', 'shift+Tab'], { stdio: 'ignore' });
}

async function focus(spike, which) {
  await spike.app.evaluate(({ BrowserWindow }, which) => {
    const wins = BrowserWindow.getAllWindows();
    const w =
      wins.find((x) =>
        which === 'game'
          ? x.getTitle().includes('spike) —')
          : x.getTitle() === 'Bollfort Steam spike',
      ) ?? wins[0];
    w.show();
    w.setAlwaysOnTop(true);
    w.focus();
    w.setAlwaysOnTop(false);
  }, which);
  await sleep(800);
}

/** The spike's process and its children (Electron's GPU, renderer and utility processes). */
function processTree(pid) {
  let pairs;
  if (WIN) {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }',
      ],
      { encoding: 'utf8' },
    );
    pairs = out
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => l.trim().split(/\s+/).map(Number));
  } else {
    const out = spawnSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' }).stdout ?? '';
    pairs = out
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => l.trim().split(/\s+/).map(Number));
  }
  const tree = new Set([pid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [p, parent] of pairs)
      if (tree.has(parent) && !tree.has(p)) (tree.add(p), (grew = true));
  }
  return tree;
}

/** The processes of the spike that hold Steam's overlay renderer, by PID. */
function overlayLoaded(pid) {
  try {
    const tree = processTree(pid);
    if (WIN) {
      const out = execFileSync(
        'tasklist',
        ['/m', 'gameoverlayrenderer64.dll', '/fo', 'csv', '/nh'],
        { encoding: 'utf8' },
      );
      return out
        .split(/\r?\n/)
        .map((l) => Number(l.split('","')[1]))
        .filter((p) => tree.has(p));
    }
    return [...tree].filter((p) => {
      try {
        return fs.readFileSync(`/proc/${p}/maps`, 'utf8').includes('gameoverlayrenderer');
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/** Every socket listening in the process, with its address: loopback only means no prompt. */
function listeners(pid) {
  const tree = processTree(pid);
  if (WIN) {
    const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
    const v6 = execFileSync('netstat', ['-ano', '-p', 'TCPv6'], { encoding: 'utf8' });
    return (
      (out + v6)
        .split(/\r?\n/)
        .map((l) => l.trim().split(/\s+/))
        // A listening row has no remote end; its state's word is the system language's.
        .filter((c) => /^(0\.0\.0\.0|\[::\]):0$/.test(c[2] ?? '') && tree.has(Number(c[4])))
        .map((c) => c[1])
    );
  }
  const out = spawnSync('ss', ['-ltnpH'], { encoding: 'utf8' }).stdout ?? '';
  return out
    .split('\n')
    .filter((l) => [...tree].some((p) => l.includes(`pid=${p},`)))
    .map((l) => l.trim().split(/\s+/)[3]);
}
const loopback = (addr) => /^(127\.|\[::1\]|::1)/.test(addr);

function steamRunning() {
  if (WIN)
    return execFileSync('tasklist', ['/fi', 'IMAGENAME eq steam.exe'], {
      encoding: 'utf8',
    }).includes('steam.exe');
  return spawnSync('pgrep', ['-x', 'steam'], { stdio: 'ignore' }).status === 0;
}
function steamExe() {
  if (!WIN) return 'steam';
  const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamExe'], {
    encoding: 'utf8',
  });
  return out.match(/SteamExe\s+REG_SZ\s+(.+)/)[1].trim();
}

// --- The checks -------------------------------------------------------------------------------

async function checkStart() {
  const s = await Spike.launch();
  try {
    const st = await s.state();
    record('start', 'control window opens', st !== null);
    record(
      'start',
      'Steam initialised, user shown (Q1)',
      !!st?.name,
      st?.name ? `${st.name} (${st.steamId})` : st?.initError,
    );
    record('start', 'restartAppIfNecessary(480) (Q6)', null, st?.restart);
    record('start', 'Steam language / on a Deck', null, `${st?.language} / ${st?.onDeck}`);
    await sleep(5000);
    const ov = overlayLoaded(s.pid);
    record(
      'start',
      'overlay renderer loaded into the process (Q2, part)',
      ov.length ? true : WIN ? false : null,
      ov.length
        ? `PIDs ${ov.join(', ')}`
        : WIN
          ? ''
          : 'Linux loads the overlay only for games Steam starts (LD_PRELOAD): expected absent here',
    );
    await s.note('start');
    keepLog(s, 'start');
  } finally {
    await s.close();
  }
}

async function hostAndOpen(s, type) {
  await s.call('host', type);
  const made = await s.waitLog(new RegExp(`lobby \\d+ made \\(${type}\\)`));
  const game = await s.gameWindow();
  const room = await s.waitLog(/room \S+ published/, 60_000);
  let begin = false;
  if (game) {
    try {
      await game.waitForSelector('#begin', { timeout: 60_000 });
      begin = true;
    } catch {
      // reported
    }
  }
  return { made, game, room, begin };
}

async function checkSockets() {
  const s = await Spike.launch();
  try {
    const h = await hostAndOpen(s, 'friends');
    const l = listeners(s.pid);
    const outside = l.filter((a) => !loopback(a));
    record(
      'sockets',
      'server listens on 127.0.0.1:8090',
      l.some((a) => /^127\.0\.0\.1:8090$/.test(a)),
      l.join(', '),
    );
    record(
      'sockets',
      'nothing listens beyond this machine (no firewall prompt)',
      outside.length === 0,
      outside.join(', ') || 'loopback only',
    );
    await s.note('sockets');
    keepLog(s, 'sockets');
    void h;
  } finally {
    await s.close();
  }
}

async function checkLobbies() {
  for (const type of ['friends', 'public', 'private']) {
    const s = await Spike.launch();
    try {
      const h = await hostAndOpen(s, type);
      record('lobbies', `${type}: Steam lobby made`, !!h.made, h.made ?? '');
      record('lobbies', `${type}: game window opens in Bollfort's lobby`, h.begin);
      record('lobbies', `${type}: room published in the Steam lobby`, !!h.room, h.room ?? '');
      if (h.game) await h.game.screenshot({ path: path.join(OUT, `lobby-${type}.png`) });
      await sleep(3000);
      const ours = await s.call('list');
      const listed = await s.waitLog(/getLobbies: /, 15_000);
      const st = await s.state();
      const mine = ours.some((l) => l.id === st.lobby);
      // A friends or invite-only lobby is never in the public list; a public one should be.
      record(
        'lobbies',
        `${type}: own lobby in getLobbies (${type === 'public' ? 'expected' : 'not expected'})`,
        type === 'public' ? mine : !mine,
        `${listed?.replace(/^\S+\s+/, '')}; ours: ${JSON.stringify(ours)}`,
      );
      await s.note(`lobbies ${type}`);
      keepLog(s, `lobbies-${type}`);
    } finally {
      await s.close();
    }
  }
}

async function checkOverlay() {
  const s = await Spike.launch();
  try {
    const h = await hostAndOpen(s, 'friends');
    await sleep(4000);
    const ov = overlayLoaded(s.pid);
    record(
      'overlay',
      'overlay renderer loaded into the process',
      ov.length ? true : WIN ? false : null,
      ov.join(', '),
    );
    // Side by side, so a screenshot shows which window the overlay draws in.
    await s.app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows())
        if (w.getTitle() === 'Bollfort Steam spike')
          w.setBounds({ x: 0, y: 40, width: 760, height: 900 });
        else w.setBounds({ x: 780, y: 40, width: 1280, height: 800 });
    });
    for (const which of ['game', 'control']) {
      await focus(s, which);
      shiftTab();
      await sleep(2500);
      record(
        'overlay',
        `Shift+Tab, the ${which} window in front: screenshot`,
        null,
        screenshot(`overlay-${which}-shift-tab`),
      );
      shiftTab();
      await sleep(1500);
      await focus(s, which);
      await s.call('friends');
      await sleep(2500);
      record(
        'overlay',
        `overlay.activateDialog(friends), the ${which} window in front: screenshot`,
        null,
        screenshot(`overlay-${which}-api-friends`),
      );
      shiftTab();
      await sleep(1500);
    }
    await focus(s, 'game');
    await s.call('invite');
    await sleep(3000);
    record(
      'overlay',
      'lobby.openInviteDialog: screenshot',
      null,
      screenshot('overlay-3-invite-lobby'),
    );
    shiftTab();
    await sleep(1500);
    await focus(s, 'game');
    await s.call('overlayInvite');
    await sleep(3000);
    record(
      'overlay',
      'overlay.activateInviteDialog: screenshot',
      null,
      screenshot('overlay-4-invite-overlay'),
    );
    shiftTab();
    await sleep(1500);
    const errors = s.lines().filter((l) => /failed|error/i.test(l));
    record(
      'overlay',
      'no errors while the overlay opened',
      errors.length === 0,
      errors.join(' | '),
    );
    await s.note('overlay');
    // The overlay drew in the control window, the first one made, whichever was in front
    // (2026-11-07). The Steam build has one window: with the control window gone, does the
    // game's take the overlay?
    await s.app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows())
        if (w.getTitle() === 'Bollfort Steam spike') w.destroy();
    });
    await sleep(1500);
    await focus(s, 'game');
    shiftTab();
    await sleep(2500);
    record(
      'overlay',
      'Shift+Tab, the control window closed, the game window alone: screenshot',
      null,
      screenshot('overlay-game-alone-shift-tab'),
    );
    shiftTab();
    await sleep(1500);
    keepLog(s, 'overlay');
    void h;
  } finally {
    await s.close();
  }
}

async function checkConnect() {
  // The closed-game path's own code: Steam passes +connect_lobby <id>. A lobby that does not
  // exist is enough to see the spike take the argument and try it, and not crash.
  const s = await Spike.launch(['+connect_lobby', '109775241000000000']);
  try {
    const started = await s.waitLog(/started with \+connect_lobby 109775241000000000/, 15_000);
    const tried = await s.waitLog(/join failed|joined lobby/, 30_000);
    const st = await s.state();
    record('connect', '+connect_lobby read from the command line', !!started, started ?? '');
    record(
      'connect',
      'join attempted, a bad lobby refused without a crash',
      !!tried && st !== null,
      tried ?? 'no answer in 30 s',
    );
    keepLog(s, 'connect');
  } finally {
    await s.close();
  }
}

async function checkMatch() {
  const s = await Spike.launch();
  try {
    const h = await hostAndOpen(s, 'friends');
    if (!h.begin) {
      record('match', 'lobby ready to start', false);
      return;
    }
    await h.game.click('#begin');
    const started = await s.waitLog(/match started: lobby closed to joins/, 30_000);
    record('match', 'match starts; Steam lobby closed to joins', !!started);
    const t0 = Date.now();
    let ended = false;
    while (Date.now() - t0 < MATCH_MINUTES * 60_000) {
      if (await h.game.$('.end-screen .banner.summary')) {
        ended = true;
        break;
      }
      if (!s.app.windows().includes(h.game)) break;
      await sleep(5000);
    }
    const minutes = ((Date.now() - t0) / 60_000).toFixed(1);
    record(
      'match',
      'eight seats (host idle, seven bots) played to the end screen',
      ended,
      `${minutes} min`,
    );
    if (ended) await h.game.screenshot({ path: path.join(OUT, 'match-end.png') });
    const bad = s.lines().filter((l) => /game error|page gone|mismatch|desync/i.test(l));
    record(
      'match',
      'no game errors, no lost page, no hash mismatch',
      bad.length === 0,
      bad.slice(0, 5).join(' | '),
    );
    const warnings = s.lines().filter((l) => /game warning/.test(l));
    if (warnings.length) record('match', 'game warnings', null, warnings.slice(0, 5).join(' | '));
    await s.note('match');
    keepLog(s, 'match');
  } finally {
    await s.close();
  }
}

async function checkNoSteam() {
  const exe = steamExe();
  if (steamRunning()) {
    spawnSync(exe, ['-shutdown'], { stdio: 'ignore', timeout: 30_000 });
    for (let i = 0; i < 60 && steamRunning(); i++) await sleep(1000);
  }
  record('nosteam', 'Steam shut down', !steamRunning());
  try {
    const s = await Spike.launch();
    try {
      const st = await s.state();
      const said = await s.waitLog(/Steam did not initialise/, 10_000);
      record(
        'nosteam',
        'spike starts and says Steam did not initialise; no crash',
        !!said && st !== null && !st.name,
        st?.initError ?? '',
      );
      record('nosteam', 'restartAppIfNecessary(480) without Steam', null, st?.restart);
      await sleep(3000);
      record('nosteam', 'still running after 3 s', s.app.windows().length > 0);
      keepLog(s, 'nosteam');
    } finally {
      await s.close();
    }
  } finally {
    // Steam back as it was, logged in: the next spike start must find the user.
    spawn(exe, WIN ? ['-silent'] : ['-silent'], { detached: true, stdio: 'ignore' }).unref();
    let back = false;
    for (let i = 0; i < 24 && !back; i++) {
      await sleep(10_000);
      if (!steamRunning()) continue;
      const s = await Spike.launch();
      const st = await s.state();
      back = !!st?.name;
      await s.close();
    }
    record('nosteam', 'Steam started again and logged in', back);
  }
}

// --- Run --------------------------------------------------------------------------------------

const CHECKS = {
  start: checkStart,
  sockets: checkSockets,
  lobbies: checkLobbies,
  overlay: checkOverlay,
  connect: checkConnect,
  match: checkMatch,
  nosteam: checkNoSteam,
};

if (!fs.existsSync(EXE)) {
  console.error(`No spike at ${EXE}: run npm run package in spike/steam first, or pass --app.`);
  process.exit(2);
}
console.log(`Spike: ${EXE}\nResults: ${OUT}\nSteps: ${STEPS.join(', ')}\n`);
if (!steamRunning() && !STEPS.every((s) => s === 'nosteam'))
  console.log('Warning: Steam does not seem to be running.\n');

await waitPortFree();
for (const step of STEPS) {
  try {
    await CHECKS[step]();
  } catch (e) {
    record(step, 'ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' ') ?? e);
  }
}

const lines = [
  `# Steam spike, automated checks — ${os.hostname()}, ${process.platform}, ${STAMP}`,
  '',
  `Spike: \`${EXE}\``,
  '',
  '| Step | Check | Result | Detail |',
  '| ---- | ----- | ------ | ------ |',
  ...results.map(
    (r) =>
      `| ${r.step} | ${r.check} | ${r.result} | ${r.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`,
  ),
  '',
];
fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.result === 'FAIL').length;
console.log(`\n${results.length} checks, ${failed} failed. Report: ${path.join(OUT, 'report.md')}`);
process.exit(failed ? 1 : 0);
