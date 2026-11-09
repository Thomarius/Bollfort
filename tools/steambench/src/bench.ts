// The Steam test bench (STEAM.md 3.4): multiplayer over Steam between this machine (Arnoldex)
// and the VM "bollfort-guest" (a second account), every path by script.
//
//   npx tsx tools/steambench/src/bench.ts [scenario...] [--reverse]
//                                         [--app DIR] [--out DIR] [--no-deploy] [--reset] [--full]
//
// Scenarios: start (the Steam build, S2; --steam-restart shuts Steam down for its last part),
// join, public, private, code, match, lag, outage, reversed, restart, invite (all, in that order, by
// default). The app under test is the Steam build (S3, its Linux folder
// `packages/desktop/release/steam/linux-unpacked`, packaged with BOLLFORT_STEAM=1), copied into
// the VM first (the S1 spike, once its reference, is gone: ARCHIVE 15zt). Both Steams
// running and logged in; the desktop left alone. Only `match` plays all ten rounds; the other
// matches are three to seven (`&rounds=`), and --full plays every one to ten. lag and outage need `sudo -n /usr/sbin/tc` (a
// sudoers line). --reset only removes any shaping left by a crashed run.
import fs from 'node:fs';
import path from 'node:path';

import type { Page } from 'playwright';

import { within, type AppState, type AppUnderTest } from './app.js';
import { busy, LocalMachine, sleep, STEAM_BUILD, VmMachine, type Machine } from './machines.js';
import { SteamApp } from './steamApp.js';
import { Network, type Shape } from './network.js';
import { scenarioStart } from './steamBuild.js';

const REPO = path.resolve(import.meta.dirname, '../../..');
const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : undefined;
};
const flag = (name: string): boolean => argv.includes(`--${name}`);
const valued = new Set(
  ['--app', '--out', '--steam-app'].flatMap((o) => {
    const at = argv.indexOf(o);
    return at >= 0 ? [argv[at + 1] ?? ''] : [];
  }),
);

const ALL = [
  'start',
  'join',
  'public',
  'private',
  'code',
  'match',
  'lag',
  'outage',
  'reversed',
  'restart',
  'invite',
] as const;
type Scenario = (typeof ALL)[number];
const asked = argv.filter((a) => !a.startsWith('--') && !valued.has(a));
for (const a of asked)
  if (!(ALL as readonly string[]).includes(a)) throw new Error(`no scenario ${a}`);
const SCENARIOS: Scenario[] = asked.length > 0 ? (asked as Scenario[]) : [...ALL];

/** The Steam build (STEAM.md §3.5) for `start`, packaged with BOLLFORT_STEAM=1. */
const STEAM_DIR = path.resolve(
  opt('steam-app') ?? path.join(REPO, 'packages/desktop/release/steam/linux-unpacked'),
);
const TARGET = STEAM_BUILD;
const APP_DIR = path.resolve(opt('app') ?? STEAM_DIR);
const STAMP = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const OUT = path.resolve(opt('out') ?? path.join(REPO, 'steambench-results', STAMP));
/** Both seats played by the autopilot, so the guest's moves cross Steam too. */
const PARAMS = ['--game-params', 'autopilot=1'];
/**
 * The host's: both seats on autopilot, and the match's rounds where a scenario plays fewer than
 * the rules' ten (`&rounds=`). --full plays every match to ten.
 */
const hostParams = (rounds: number | undefined): string[] =>
  rounds === undefined || flag('full') ? PARAMS : ['--game-params', `autopilot=1&rounds=${rounds}`];
/** A match of ten rounds takes some 11 minutes; past this, it is stuck. */
const MATCH_LIMIT_MS = 25 * 60_000;

const t0 = Date.now();
function say(text: string): void {
  const s = ((Date.now() - t0) / 1000).toFixed(0).padStart(5);
  console.log(`${s} s  ${text}`);
}

// --- Results -----------------------------------------------------------------------------------

interface Check {
  check: string;
  ok: boolean | null;
  detail: string;
}
interface Result {
  scenario: string;
  checks: Check[];
  figures: Record<string, unknown>;
  minutes: number;
}
const results: Result[] = [];

class Run {
  readonly checks: Check[] = [];
  readonly figures: Record<string, unknown> = {};
  readonly dir: string;
  private readonly start = Date.now();
  constructor(readonly scenario: string) {
    this.dir = path.join(OUT, scenario);
    fs.mkdirSync(this.dir, { recursive: true });
  }
  check(check: string, ok: boolean | null, detail: unknown = ''): void {
    const d = String(detail);
    this.checks.push({ check, ok, detail: d });
    const mark = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'NOTE';
    say(`[${mark}] ${this.scenario}: ${check}${d ? ` — ${d}` : ''}`);
  }
  save(name: string, text: string): void {
    fs.writeFileSync(path.join(this.dir, name), text);
  }
  done(): void {
    results.push({
      scenario: this.scenario,
      checks: this.checks,
      figures: this.figures,
      minutes: +((Date.now() - this.start) / 60_000).toFixed(1),
    });
    writeReport();
  }
}

function writeReport(): void {
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 1));
  const md = [`# Steam bench, ${STAMP}`, '', `App (${TARGET.name}): \`${APP_DIR}\``, ''];
  for (const r of results) {
    const failed = r.checks.filter((c) => c.ok === false).length;
    md.push(
      `## ${r.scenario} — ${failed === 0 ? 'passed' : `${failed} failed`} (${r.minutes} min)`,
      '',
    );
    md.push('| Result | Check | Detail |', '| --- | --- | --- |');
    for (const c of r.checks)
      md.push(
        `| ${c.ok === true ? 'PASS' : c.ok === false ? 'FAIL' : 'note'} | ${c.check} | ${c.detail.replace(/\|/g, '/')} |`,
      );
    md.push('', '```json', JSON.stringify(r.figures, null, 1), '```', '');
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n'));
}

// --- The pages ---------------------------------------------------------------------------------

/**
 * A meter on a game page: frames a 10 s window and frames over 50 ms; and every WebSocket made
 * from now on counted — after the first connection, each is a rejoin, which is how the game mends
 * a hash mismatch (ARCHIVE 15zc), so it counts the host's page too.
 */
/**
 * As text, not a function: tsx compiles a function passed to `evaluate` with esbuild's keepNames,
 * whose `__name` helper the page lacks, and the meter stopped at its first named arrow
 * (2026-11-09, every frame figure null).
 */
const INSTRUMENT = `(() => {
  const w = window;
  if (w.__meter !== undefined) return;
  w.__meter = [];
  w.__sockets = 0;
  const Base = w.WebSocket;
  w.WebSocket = class extends Base {
    constructor(...a) {
      super(...a);
      w.__sockets++;
    }
  };
  let last = performance.now(), start = last, frames = 0, slow = 0;
  function tick(now) {
    frames++;
    if (now - last > 50) slow++;
    last = now;
    if (now - start >= 10000) {
      w.__meter.push({ fps: +(frames / ((now - start) / 1000)).toFixed(1), slow });
      frames = 0;
      slow = 0;
      start = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})()`;

function instrument(page: Page): Promise<void> {
  return within(page.evaluate(INSTRUMENT), 10_000, undefined);
}

interface PageReading {
  /** The game's network badge: good, slow or bad (a lost link, the seat being won back). */
  link: string | null;
  fps: number | null;
  slow: number | null;
  sockets: number | null;
  ended: boolean;
}
async function read(page: Page | null): Promise<PageReading> {
  const none = { link: null, fps: null, slow: null, sockets: null, ended: false };
  if (page === null) return none;
  return within(
    page.evaluate(() => {
      const w = window as unknown as {
        __meter?: { fps: number; slow: number }[];
        __sockets?: number;
      };
      const m = w.__meter?.at(-1);
      return {
        link: document.querySelector('#network')?.className ?? null,
        fps: m?.fps ?? null,
        slow: m?.slow ?? null,
        sockets: w.__sockets ?? null,
        ended: document.querySelector('.end-screen .banner.summary') !== null,
      };
    }),
    5000,
    none,
  );
}

/** The end screen's figures in their order — places, points, lives — to compare both sides. */
function scores(page: Page | null): Promise<string[]> {
  if (page === null) return Promise.resolve([]);
  return within(
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.end-screen [data-count]')].map(
        (e) => e.dataset['count'] ?? '',
      ),
    ),
    5000,
    [],
  );
}

// --- Seating -----------------------------------------------------------------------------------

interface Table {
  lobby: string;
  hostGame: Page;
  guestGame: Page | null;
  /** Steam's first answer to the guest, in seconds; null if never. */
  firstAnswer: number | null;
  /** From the guest's start to its Ready button, in ms; null if never seated. */
  seatedMs: number | null;
}

async function hostTable(
  host: AppUnderTest,
  type: 'friends' | 'public' | 'private',
  rounds?: number,
): Promise<{ lobby: string; game: Page }> {
  await host.start(hostParams(rounds));
  const lobby = await host.host(type);
  const game = await host.game();
  if (game === null) throw new Error('the host has no game window');
  await game.waitForSelector('#begin', { timeout: 60_000 });
  return { lobby, game };
}

/** The guest started by `+connect_lobby`, as Steam starts a game for an invite. */
async function joinGuest(
  guest: AppUnderTest,
  lobby: string,
): Promise<Omit<Table, 'lobby' | 'hostGame'>> {
  const started = Date.now();
  await guest.start([...PARAMS, '+connect_lobby', lobby]);
  return seatGuest(guest, started);
}

async function seatGuest(
  guest: AppUnderTest,
  started: number,
): Promise<Omit<Table, 'lobby' | 'hostGame'>> {
  const answer = await guest.waitLog(/the host answered over Steam after ([\d.]+) s/, 45_000);
  const guestGame = await guest.game(answer === null ? 5000 : 60_000);
  let seatedMs: number | null = null;
  if (guestGame !== null) {
    const seated = await within(
      guestGame.waitForSelector('#ready[data-ready="true"]', { timeout: 60_000 }).then(() => true),
      65_000,
      false,
    );
    if (seated) seatedMs = Date.now() - started;
  }
  return { guestGame, firstAnswer: answer === null ? null : Number(answer[1]), seatedMs };
}

async function startMatch(table: Table): Promise<void> {
  await table.guestGame!.click('#ready');
  await table.hostGame.waitForSelector('#begin:not([disabled])', { timeout: 30_000 });
  await sleep(1000);
  await table.hostGame.click('#begin');
}

function logIssues(lines: string[]): { errors: string[]; p2pFailed: string[]; warnings: string[] } {
  return {
    errors: lines.filter((l) => /game error|page gone|mismatch|desync/i.test(l)),
    p2pFailed: lines.filter((l) => /P2P session .* failed/.test(l)),
    warnings: lines.filter((l) => /game warning/.test(l)),
  };
}

// --- The scenarios -----------------------------------------------------------------------------

async function scenarioJoin(run: Run, host: AppUnderTest, guest: AppUnderTest): Promise<void> {
  const { lobby } = await hostTable(host, 'friends');
  const tries = [];
  for (let i = 1; i <= 5; i++) {
    const t = await joinGuest(guest, lobby);
    tries.push({
      firstAnswer: t.firstAnswer,
      seatedS: t.seatedMs === null ? null : t.seatedMs / 1000,
    });
    run.check(
      `join ${i}: seated`,
      t.seatedMs !== null,
      `first answer ${t.firstAnswer ?? '-'} s, seated after ${t.seatedMs === null ? '-' : (t.seatedMs / 1000).toFixed(1)} s`,
    );
    run.save(`guest-${i}.log`, guest.lines().join('\n'));
    await guest.stop();
    await sleep(5000);
  }
  run.figures['tries'] = tries;
  run.save('host.log', host.lines().join('\n'));
}

/** An Invite-only lobby, joined as Steam starts a game for an accepted invite. */
async function scenarioPrivate(run: Run, host: AppUnderTest, guest: AppUnderTest): Promise<void> {
  const { lobby } = await hostTable(host, 'private');
  const t = await joinGuest(guest, lobby);
  const joined = guest.lines().find((l) => /joined lobby|join failed|never named a room/.test(l));
  run.check(
    'joined the Invite-only lobby',
    joined !== undefined && /joined lobby/.test(joined),
    joined ?? 'nothing',
  );
  run.check(
    'seated',
    t.seatedMs !== null,
    `first answer ${t.firstAnswer ?? '-'} s, seated after ${t.seatedMs === null ? '-' : (t.seatedMs / 1000).toFixed(1)} s`,
  );
  run.save('host.log', host.lines().join('\n'));
  run.save('guest.log', guest.lines().join('\n'));
}

/**
 * The Steam build's code (STEAM.md §7.3): the guest types the host's code into the menu, as a
 * player sent it does — twice, its app started afresh between, in the host's lobby both times.
 * The guest reaches the host over P2P directly, no lobby asked.
 */
async function scenarioCode(run: Run, host: AppUnderTest, guest: AppUnderTest): Promise<void> {
  if (!(host instanceof SteamApp) || !(guest instanceof SteamApp))
    throw new Error("code is the Steam build's");
  await hostTable(host, 'friends');
  const code = await host.code();
  run.check('the host shows its Steam code', code !== null && /^[A-Z2-9]{7}$/.test(code), code);
  if (code === null) return;
  for (let i = 1; i <= 2; i++) {
    const started = Date.now();
    await guest.start(PARAMS);
    await guest.joinByCode(code);
    const t = await seatGuest(guest, started);
    run.check(
      `by code ${i}: seated`,
      t.seatedMs !== null,
      `first answer ${t.firstAnswer ?? '-'} s, seated after ${t.seatedMs === null ? '-' : (t.seatedMs / 1000).toFixed(1)} s`,
    );
    run.save(`guest-${i}.log`, guest.lines().join('\n'));
    await guest.stop();
    await sleep(5000);
  }
  run.save('host.log', host.lines().join('\n'));
}

async function scenarioPublic(run: Run, host: AppUnderTest, guest: AppUnderTest): Promise<void> {
  const { lobby } = await hostTable(host, 'public');
  const started = Date.now();
  await guest.start(PARAMS);
  const listed = (await guest.call('list')) as { id: string }[];
  const line = guest.lines().find((l) => l.includes('getLobbies:')) ?? '';
  const found = listed.some((l) => l.id === lobby);
  run.check('our lobby in getLobbies', found ? true : null, line.replace(/^\S+\s+/, ''));
  await guest.call('join', lobby);
  const t = await seatGuest(guest, started);
  run.check(
    `seated, joined by ${found ? 'the list' : 'its ID'}`,
    t.seatedMs !== null,
    `first answer ${t.firstAnswer ?? '-'} s`,
  );
  run.save('host.log', host.lines().join('\n'));
  run.save('guest.log', guest.lines().join('\n'));
}

interface MatchPlan {
  /**
   * The match's rounds, fewer than ten where the end screen and the hashes are what is checked,
   * not the late game: a match of ten blocks the machine for some 10 minutes (the user's,
   * 2026-11-09). Only `match` plays all ten, for the clean figures.
   */
  rounds?: number;
  /** Shaping from a second into the match, per direction. */
  shapes?: { atS: number; name: string; shape: Shape }[];
  /** The guest cut off at a second into the match, for so many seconds. */
  cuts?: { atS: number; seconds: number }[];
  /** The guest's app killed at a second into the match and started again. */
  restartAtS?: number;
  /**
   * Coming back by the host's invite (S3.6): the guest's app killed at that second and started
   * again, its prompt left; the host's Invite back in the pause menu, accepted on the guest.
   */
  invite?: boolean;
}

async function scenarioMatch(
  run: Run,
  host: AppUnderTest,
  guest: AppUnderTest,
  plan: MatchPlan,
  network: Network | null,
): Promise<void> {
  const { lobby, game: hostGame } = await hostTable(host, 'friends', plan.rounds);
  const seat = await joinGuest(guest, lobby);
  run.check('seated', seat.seatedMs !== null, `first answer ${seat.firstAnswer ?? '-'} s`);
  if (seat.seatedMs === null) return;
  const table: Table = { lobby, hostGame, ...seat };
  await startMatch(table);
  let guestGame = table.guestGame;
  await instrument(hostGame);
  await instrument(guestGame!);
  const started = Date.now();
  const at = (): number => (Date.now() - started) / 1000;

  const samples: Record<string, unknown>[] = [];
  const events: string[] = [];
  const phases: { name: string; rttSum: number; rttCount: number }[] = [];
  let phase = { name: 'clean', rttSum: 0, rttCount: 0 };
  phases.push(phase);
  let lastGuest: AppState | null = await guest.state();
  let hostCpu = host.machine.cpu();
  let guestCpu = guest.machine.cpu();
  const shapes = [...(plan.shapes ?? [])];
  const cuts = [...(plan.cuts ?? [])];
  let restartAt = plan.restartAtS ?? null;
  let ended = { host: false, guest: false };
  let hostEndedAt: number | null = null;

  while (Date.now() - started < MATCH_LIMIT_MS) {
    await sleep(10_000);
    const next = shapes[0];
    if (next !== undefined && at() >= next.atS && network !== null) {
      shapes.shift();
      network.shape(next.shape);
      phase = { name: next.name, rttSum: 0, rttCount: 0 };
      phases.push(phase);
      events.push(`${at().toFixed(0)} s: ${next.name}`);
      say(`shaped: ${next.name}`);
    }
    const cut = cuts[0];
    if (cut !== undefined && at() >= cut.atS && network !== null) {
      cuts.shift();
      say(`cutting the guest off for ${cut.seconds} s`);
      const guestFrom = guest.lines().length;
      const hostFrom = host.lines().length;
      await network.cut(cut.seconds);
      // Steam drops the session after some 20 s of silence and makes it again some 20 s after
      // the network is back (2026-11-09): only new lines count.
      const back = await guest.waitLog(
        /the host answers again, after ([\d.]+) s/,
        90_000,
        guestFrom,
      );
      await sleep(15_000);
      const gl = guest.lines().slice(guestFrom);
      const hl = host.lines().slice(hostFrom);
      const failed = gl.some((l) => /P2P session .* failed/.test(l));
      const refused = hl.some((l) => /refused a socket/.test(l));
      const page = await read(guestGame);
      const inMatch = page.link !== null && page.link !== 'bad';
      events.push(
        `${at().toFixed(0)} s: cut ${cut.seconds} s; guest: ${gl.filter((l) => /host|P2P|socket|lobby/.test(l)).join(' / ')}; host: ${hl.filter((l) => /P2P|socket|lobby/.test(l) && !/server:/.test(l)).join(' / ')}`,
      );
      run.check(
        `cut ${cut.seconds} s: Steam's session back`,
        back !== null,
        `${back?.[0] ?? 'no answer in 90 s'}${failed ? '; the session failed and was made again' : ''}`,
      );
      run.check(
        `cut ${cut.seconds} s: the guest's game in the match again`,
        inMatch,
        `badge ${page.link}${refused ? "; the host refused the guest's socket: not in the lobby" : ''}`,
      );
    }
    if (restartAt !== null && at() >= restartAt) {
      restartAt = null;
      say("killing the guest's app in the match");
      await guest.stop();
      const again = Date.now();
      if (!(guest instanceof SteamApp) || !(host instanceof SteamApp))
        throw new Error("restart is the Steam build's");
      // S3.6 (STEAM.md §7.3): started again, the host asked whether the match still runs and the
      // player offered to rejoin it; the seat taken back by Steam ID, over P2P to the host.
      await guest.start(PARAMS);
      const offered = await guest.rejoinOffered(30_000, plan.invite !== true);
      run.check('restarted: offered to rejoin', offered, offered ? '' : 'not in 30 s');
      if (plan.invite === true) {
        // The prompt left: the host invites the player back from the pause menu instead.
        const hostFrom = host.lines().length;
        const guestFrom = guest.lines().length;
        const invited = await host.inviteBack(30_000);
        const sent = await host.waitLog(/invited \d+ back/, 10_000, hostFrom);
        run.check(
          'invite: Invite back in the pause menu, sent by Steam',
          invited !== null && sent !== null,
          invited === null ? 'no button' : (sent?.[0] ?? 'not sent'),
        );
        const hostId = (await host.state())?.steamId ?? '';
        guest.acceptInvite(lobby, hostId);
        const handed = await guest.waitLog(/join asked: lobby \d+ from \d+/, 20_000, guestFrom);
        run.check(
          'invite: Steam handed the invite to the running game, with the inviter',
          handed !== null,
          handed?.[0] ?? 'nothing in 20 s: taken by the page instead',
        );
        if (handed === null) await guest.inviteByPage(lobby, hostId);
      }
      const page = await guest.game(30_000);
      const inMatch =
        page !== null &&
        (await within(
          page.waitForSelector('canvas', { timeout: 30_000 }).then(() => true),
          35_000,
          false,
        )) &&
        (await within(
          page.waitForSelector('.error, .menu', { timeout: 5000 }).then(() => false),
          6000,
          true,
        ));
      run.check(
        'restarted: back in the match',
        // The spike could not (S1); the Steam build must (S3).
        inMatch,
        `${((Date.now() - again) / 1000).toFixed(0)} s; ${page?.url() ?? 'no game window'}`,
      );
      events.push(
        `${at().toFixed(0)} s: guest restarted, ${plan.invite === true ? 'invited back' : 'rejoined from the prompt'}`,
      );
      guestGame = page;
      if (page !== null) await instrument(page);
    }

    const [h, g] = await Promise.all([read(hostGame), read(guestGame)]);
    const gs = await guest.state(3000);
    if (gs !== null && lastGuest !== null && gs.rttCount >= lastGuest.rttCount) {
      phase.rttSum += gs.rttSum - lastGuest.rttSum;
      phase.rttCount += gs.rttCount - lastGuest.rttCount;
    }
    if (gs !== null) lastGuest = gs;
    let sample: Record<string, unknown> = { t: Math.round(at()) };
    try {
      const hc = host.machine.cpu();
      const gc = guest.machine.cpu();
      sample = { ...sample, hostCpu: busy(hostCpu, hc), guestCpu: busy(guestCpu, gc) };
      hostCpu = hc;
      guestCpu = gc;
    } catch {
      // the VM out of reach
    }
    sample = {
      ...sample,
      hostFps: h.fps,
      guestFps: g.fps,
      hostSlow: h.slow,
      guestSlow: g.slow,
      rtt: gs?.rtt,
    };
    samples.push(sample);
    ended = { host: ended.host || h.ended, guest: ended.guest || g.ended };
    if (ended.host && hostEndedAt === null) hostEndedAt = Date.now();
    if (ended.host && (ended.guest || guestGame === null)) break;
    // A guest still on its way after a minute will not arrive: its game is stuck.
    if (hostEndedAt !== null && Date.now() - hostEndedAt > 60_000) break;
  }
  network?.clear();
  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  const [h, g] = await Promise.all([read(hostGame), read(guestGame)]);
  const [hs, gs] = await Promise.all([scores(hostGame), scores(guestGame)]);
  const guestState = await guest.state();
  const hostLines = host.lines();
  const guestLines = guest.lines();
  const issues = logIssues([...hostLines, ...guestLines]);
  const cutOrRestart = (plan.cuts?.length ?? 0) > 0 || plan.restartAtS !== undefined;

  run.check('end screen on the host', ended.host, `${minutes} min`);
  // A guest that never came back after its restart is the restart check's failure, not three.
  const gone = plan.restartAtS !== undefined && guestGame === null;
  run.check(
    'end screen on the guest',
    gone ? null : ended.guest,
    gone ? 'the guest never came back' : '',
  );
  run.check(
    'both end screens agree',
    gone ? null : hs.length > 0 && hs.join() === gs.join(),
    `host ${hs.join(' ')} / guest ${gs.join(' ')}`,
  );
  const rejoins = {
    host: h.sockets,
    guest: g.sockets,
    guestRelay: guestState?.socketsOpenedInMatch ?? null,
  };
  run.check(
    'no rejoin (a mismatch is mended by one)',
    rejoins.host === 0 && rejoins.guest === 0 && rejoins.guestRelay === 0
      ? true
      : cutOrRestart
        ? null
        : false,
    JSON.stringify(rejoins),
  );
  run.check(
    'no game error, no mismatch',
    issues.errors.length === 0,
    issues.errors.slice(0, 3).join(' | '),
  );
  if (!cutOrRestart)
    run.check('no P2P session failed', issues.p2pFailed.length === 0, issues.p2pFailed.join(' | '));
  if (issues.warnings.length > 0)
    run.check('game warnings', null, issues.warnings.slice(0, 3).join(' | '));

  const mean = (k: string): number | null => {
    const v = samples.map((s) => s[k]).filter((x): x is number => typeof x === 'number');
    return v.length === 0 ? null : +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1);
  };
  run.figures['minutes'] = Number(minutes);
  run.figures['guest'] = guestState && {
    rttMean: guestState.rttMean,
    rttMax: guestState.rttMax,
    stalls: guestState.stalls,
    longestStallS: +(guestState.longestStallMs / 1000).toFixed(1),
    sentPackets: guestState.sentPackets,
    sendFailures: guestState.sendFailures,
    largestPacket: guestState.largestPacket,
  };
  run.figures['rttByPhase'] = phases.map((p) => ({
    phase: p.name,
    rttMean: p.rttCount === 0 ? null : Math.round(p.rttSum / p.rttCount),
    pings: p.rttCount,
  }));
  run.figures['load'] = {
    hostCpu: mean('hostCpu'),
    guestCpu: mean('guestCpu'),
    hostFps: mean('hostFps'),
    guestFps: mean('guestFps'),
  };
  run.figures['events'] = events;
  run.save('samples.json', JSON.stringify(samples, null, 1));
  run.save('host.log', hostLines.join('\n'));
  run.save('guest.log', guestLines.join('\n'));
  await within(
    hostGame.screenshot({ path: path.join(run.dir, 'host-end.png') }),
    10_000,
    undefined,
  );
  if (guestGame !== null)
    await within(
      guestGame.screenshot({ path: path.join(run.dir, 'guest-end.png') }),
      10_000,
      undefined,
    );
}

/** One direction each: a round trip gains twice. */
// A round takes about a minute, the opening a little more: the events come as early as they
// can, each with a round or more of play after it before the end screen.
const LAG: MatchPlan = {
  rounds: 5,
  shapes: [
    { atS: 0, name: 'round trip +50 ± 10 ms', shape: { delayMs: 25, jitterMs: 5, lossPct: 0 } },
    { atS: 110, name: 'round trip +150 ± 30 ms', shape: { delayMs: 75, jitterMs: 15, lossPct: 0 } },
    { atS: 220, name: '1% loss each way', shape: { delayMs: 0, jitterMs: 0, lossPct: 1 } },
  ],
};
// The 90 s cut is back some two minutes after it starts (Steam makes the session again some 20 s
// after the network returns, the page's rejoin then): ended by 390 s, a round of play after.
const OUTAGE: MatchPlan = {
  rounds: 7,
  cuts: [
    { atS: 60, seconds: 10 },
    { atS: 110, seconds: 30 },
    { atS: 180, seconds: 90 },
  ],
};

// --- Main --------------------------------------------------------------------------------------

async function main(): Promise<void> {
  // `start` alone needs neither the app under test on both machines nor the VM.
  const both = SCENARIOS.some((s) => s !== 'start') || flag('reset');
  if (both && !fs.existsSync(path.join(APP_DIR, TARGET.exe)))
    throw new Error(
      `no app in ${APP_DIR}: npm run build, then BOLLFORT_STEAM=1 npm run package -w @bollfort/desktop`,
    );
  fs.mkdirSync(OUT, { recursive: true });
  if (!both) {
    // `start` alone: this machine only, the VM left as it is, even shut down.
    for (const scenario of SCENARIOS) {
      const run = new Run(scenario);
      await scenarioStart(
        STEAM_DIR,
        (c, ok, d) => run.check(c, ok, d ?? ''),
        (n, t) => run.save(n, t),
        flag('steam-restart'),
      );
      run.done();
    }
    say(`report: ${path.join(OUT, 'report.md')}`);
    return;
  }
  const local: Machine = new LocalMachine(APP_DIR, TARGET);
  const vm = new VmMachine(TARGET);
  const shaping = Network.canShape();
  const network = shaping ? new Network(vm) : null;
  network?.clear();
  if (flag('reset')) {
    say('shaping removed');
    return;
  }
  if (!flag('no-deploy')) {
    say('copying the app into the VM');
    vm.deploy(APP_DIR);
  }
  const make = (machine: Machine, label: string): AppUnderTest => new SteamApp(machine, label);
  const apps = { local: make(local, 'this machine'), vm: make(vm, 'the VM') };
  const roles = (reverse: boolean): [AppUnderTest, AppUnderTest] =>
    reverse ? [apps.vm, apps.local] : [apps.local, apps.vm];
  say(`scenarios: ${SCENARIOS.join(', ')}; results in ${OUT}`);

  for (const scenario of SCENARIOS) {
    const run = new Run(scenario);
    const [host, guest] = roles(flag('reverse') !== (scenario === 'reversed'));
    run.figures['host'] = host.label;
    say(`=== ${scenario}: ${host.label} hosts`);
    try {
      if (scenario === 'start') {
        await scenarioStart(
          STEAM_DIR,
          (c, ok, d) => run.check(c, ok, d ?? ''),
          (n, t) => run.save(n, t),
          flag('steam-restart'),
        );
      } else if ((scenario === 'lag' || scenario === 'outage') && network === null) {
        run.check(
          'shaping available',
          false,
          'sudo -n /usr/sbin/tc refused: the sudoers line is missing',
        );
      } else if (scenario === 'join') await scenarioJoin(run, host, guest);
      else if (scenario === 'public') await scenarioPublic(run, host, guest);
      else if (scenario === 'private') await scenarioPrivate(run, host, guest);
      else if (scenario === 'code') await scenarioCode(run, host, guest);
      else if (scenario === 'lag') await scenarioMatch(run, host, guest, LAG, network);
      else if (scenario === 'outage') await scenarioMatch(run, host, guest, OUTAGE, network);
      else if (scenario === 'restart')
        await scenarioMatch(run, host, guest, { rounds: 4, restartAtS: 120 }, network);
      else if (scenario === 'invite')
        await scenarioMatch(
          run,
          host,
          guest,
          { rounds: 4, restartAtS: 120, invite: true },
          network,
        );
      // `reversed` checks the roles swapped, not the match: three rounds.
      else if (scenario === 'reversed')
        await scenarioMatch(run, host, guest, { rounds: 3 }, network);
      else await scenarioMatch(run, host, guest, {}, network);
    } catch (e) {
      run.check('ran to the end', false, (e as Error).message.split('\n')[0]);
      run.save('host.log', host.lines().join('\n'));
      run.save('guest.log', guest.lines().join('\n'));
    } finally {
      network?.clear();
      await host.stop().catch(() => undefined);
      await guest.stop().catch(() => undefined);
      run.done();
    }
  }
  vm.close();
  const failed = results.flatMap((r) =>
    r.checks.filter((c) => c.ok === false).map((c) => `${r.scenario}: ${c.check}`),
  );
  say(failed.length === 0 ? 'every check passed' : `${failed.length} failed: ${failed.join('; ')}`);
  say(`report: ${path.join(OUT, 'report.md')}`);
}

await main();
process.exit(0);
