// The bench's `start` scenario (STEAM.md §3.5, S2.4): the packaged Steam build on this machine,
// started as Steam would start it, its start-up checked. Driven over CDP as the spike is, but
// through the game page's `window.bollfortHost` — the Steam build has no control window.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type Page } from 'playwright';

import { within } from './app.js';
import { sleep } from './machines.js';

const CDP = 9225;
const EXE = 'bollfort';

interface HostSteam {
  ready: boolean;
  name: string | null;
  error: string | null;
}

export type Check = (check: string, ok: boolean | null, detail?: unknown) => void;

function processes(dir: string): string[] {
  const out = spawnSync('pgrep', ['-af', path.join(dir, EXE)], { encoding: 'utf8' }).stdout ?? '';
  return out.split('\n').filter((l) => l.trim() !== '');
}

async function stopAll(dir: string): Promise<void> {
  try {
    // Without a shell, so the pattern cannot match the command running it.
    execFileSync('pkill', ['-f', path.join(dir, EXE)]);
  } catch {
    // none running
  }
  for (let i = 0; i < 20 && processes(dir).length > 0; i++) await sleep(500);
}

/** Started detached, as Steam starts a game, with DevTools on for the bench. */
function launch(dir: string, args: readonly string[]): void {
  spawn(path.join(dir, EXE), [`--remote-debugging-port=${CDP}`, ...args], {
    cwd: dir,
    detached: true,
    stdio: 'ignore',
  }).unref();
}

async function gamePage(ms: number): Promise<{ browser: Browser; page: Page } | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`);
      const page = browser.contexts().flatMap((c) => c.pages())[0];
      if (page !== undefined) return { browser, page };
      await browser.close();
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  return null;
}

function host<T>(page: Page, call: string): Promise<T | null> {
  return within(
    page.evaluate(
      (c) =>
        (window as unknown as { bollfortHost: Record<string, () => Promise<unknown>> })
          .bollfortHost[c]!(),
      call,
    ) as Promise<T>,
    5000,
    null,
  );
}

function steamRunning(): boolean {
  return spawnSync('pgrep', ['-x', 'steam'], { stdio: 'ignore' }).status === 0;
}

/**
 * The Steam build started and looked at: its own restart without the sandbox, one window, the
 * game in it fullscreen, Steam ready, the server on this machine only, and a second start
 * handing over its lobby. With `steamRestart`, also Steam shut down — local play and the
 * notice — and Steam started again (it is the user's Steam: only when asked).
 */
export async function scenarioStart(
  dir: string,
  check: Check,
  save: (name: string, text: string) => void,
  steamRestart: boolean,
): Promise<void> {
  if (!fs.existsSync(path.join(dir, EXE))) {
    check(
      'the Steam build is there',
      false,
      `none in ${dir}: BOLLFORT_STEAM=1 npm run package -w @bollfort/desktop`,
    );
    return;
  }
  await stopAll(dir);
  const started = Date.now();
  launch(dir, []);
  const got = await gamePage(30_000);
  check('the game page up', got !== null, `${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (got === null) return;
  const { browser, page } = got;
  try {
    await page.waitForLoadState('domcontentloaded');
    const main = processes(dir).filter((l) => !l.includes('--type='));
    check(
      'started again without the sandbox, one main process',
      main.length === 1 && main[0]!.includes('--no-sandbox'),
      main.join(' | '),
    );
    const pages = browser.contexts().flatMap((c) => c.pages());
    check(
      'one window, the game',
      pages.length === 1 && /^http:\/\/127\.0\.0\.1:\d+\//.test(page.url()),
      pages.map((p) => p.url()).join(', '),
    );
    check('fullscreen', (await host<boolean>(page, 'fullscreen')) === true);
    const steam = await host<HostSteam>(page, 'steam');
    check('Steam ready', steam?.ready === true, steam?.name ?? steam?.error ?? '');
    const port = Number(new URL(page.url()).port);
    const listening = spawnSync('ss', ['-ltnH', `sport = :${port}`], {
      encoding: 'utf8',
    }).stdout.trim();
    check(
      'its server on this machine only',
      /^\S+\s+\d+\s+\d+\s+127\.0\.0\.1:/.test(listening),
      listening,
    );

    const lobby = '109775243900000001';
    const second = spawnSync(path.join(dir, EXE), ['+connect_lobby', lobby], {
      cwd: dir,
      timeout: 30_000,
      stdio: 'ignore',
    });
    let handed: string[] = [];
    for (let i = 0; i < 20 && !handed.includes(lobby); i++) {
      handed = [...handed, ...((await host<string[]>(page, 'lobbies')) ?? [])];
      if (!handed.includes(lobby)) await sleep(250);
    }
    check(
      'a second start hands its lobby over and quits',
      second.status === 0 && handed.includes(lobby),
      `exit ${second.status}, handed ${JSON.stringify(handed)}`,
    );
    await within(page.screenshot({ path: '/dev/null' }), 5000, undefined);
  } finally {
    await within(browser.close(), 5000, undefined);
    await stopAll(dir);
  }

  if (!steamRestart) {
    check('without Steam', null, "not tried: --steam-restart shuts the user's Steam down");
    return;
  }
  spawnSync('steam', ['-shutdown'], { stdio: 'ignore', timeout: 30_000 });
  for (let i = 0; i < 60 && steamRunning(); i++) await sleep(1000);
  check('Steam shut down', !steamRunning());
  try {
    launch(dir, []);
    const alone = await gamePage(30_000);
    if (alone === null) check('without Steam: the game page up', false);
    else {
      try {
        await alone.page.waitForSelector('.menu-notice', { timeout: 15_000 }).catch(() => null);
        const steam = await host<HostSteam>(alone.page, 'steam');
        const notice = await within(
          alone.page.evaluate(() => document.querySelector('.menu-notice')?.textContent ?? null),
          5000,
          null,
        );
        check(
          'without Steam: plays locally and says so',
          steam?.ready === false && notice !== null,
          `${steam?.error ?? ''} / ${notice ?? 'no notice'}`,
        );
        save('nosteam.txt', JSON.stringify({ steam, notice }, null, 1));
      } finally {
        await within(alone.browser.close(), 5000, undefined);
      }
    }
  } finally {
    await stopAll(dir);
    spawn('steam', ['-silent'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 24 && !steamRunning(); i++) await sleep(5000);
    // Logged in again before anything else uses it.
    await sleep(20_000);
    check('Steam started again', steamRunning());
  }
}
