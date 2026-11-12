import { describe, expect, it } from 'vitest';

import { SPACEWAR } from './steam.js';
import { SteamAchievements, namingFor, type StatsApi } from './steamAchievements.js';

/** Steam as far as these calls go: nothing works until its stats are loaded. */
class FakeSteam implements StatsApi {
  loaded = false;
  readonly unlocked = new Set<string>();
  readonly ints = new Map<string, number>();
  readonly known = new Set<string>(['FIRST_WIN', 'POCKET', 'ACH_WIN_ONE_GAME', 'ACH_HEAVY_FIRE']);
  stores = 0;
  progressShown: [string, number, number][] = [];

  activate(name: string): boolean {
    if (!this.loaded || !this.known.has(name)) return false;
    this.unlocked.add(name);
    return true;
  }
  isActivated(name: string): boolean {
    return this.loaded && this.unlocked.has(name);
  }
  getInt(name: string): number | null {
    return this.loaded ? (this.ints.get(name) ?? 0) : null;
  }
  setInt(name: string, value: number): boolean {
    if (!this.loaded) return false;
    this.ints.set(name, value);
    return true;
  }
  store(): boolean {
    this.stores++;
    return this.loaded;
  }
  indicateProgress(name: string, current: number, max: number): boolean {
    this.progressShown.push([name, current, max]);
    return true;
  }
}

/** A schedule run by hand, for the retries. */
function manual(): { schedule: (run: () => void) => never; tick: () => void } {
  let pending: (() => void) | null = null;
  return {
    schedule: (run) => {
      pending = run;
      return 0 as never;
    },
    tick: () => {
      const run = pending;
      pending = null;
      run?.();
    },
  };
}

describe('Steam achievements, the app’s side', () => {
  it('counts ours under our App ID, and under 480 only behind the switch', () => {
    expect(namingFor(3_000_000, undefined)).toBe('own');
    expect(namingFor(SPACEWAR, undefined)).toBe('off');
    expect(namingFor(SPACEWAR, 'spacewar')).toBe('spacewar');
  });

  it('unlocks at once once Steam has the stats', () => {
    const steam = new FakeSteam();
    steam.loaded = true;
    new SteamAchievements(steam, 'own').achieve('FIRST_WIN');
    expect(steam.unlocked.has('FIRST_WIN')).toBe(true);
  });

  it('waits for Steam’s stats, then unlocks and stores', () => {
    const steam = new FakeSteam();
    const clock = manual();
    const achievements = new SteamAchievements(steam, 'own', () => {}, clock.schedule);
    achievements.achieve('FIRST_WIN');
    expect(steam.unlocked.size).toBe(0);
    clock.tick();
    expect(steam.unlocked.size).toBe(0);
    steam.loaded = true;
    clock.tick();
    expect(steam.unlocked.has('FIRST_WIN')).toBe(true);
    expect(steam.stores).toBe(1);
  });

  it('gives up on a name Steam never takes', () => {
    const steam = new FakeSteam();
    steam.loaded = true;
    const clock = manual();
    const lines: string[] = [];
    const achievements = new SteamAchievements(steam, 'own', (l) => lines.push(l), clock.schedule);
    achievements.achieve('NOT_ENTERED');
    for (let i = 0; i < 20; i++) clock.tick();
    expect(lines.at(-1)).toMatch(/given up/);
  });

  it('reads no stats until Steam has them, and only raises them', () => {
    const steam = new FakeSteam();
    const achievements = new SteamAchievements(steam, 'own');
    expect(achievements.stats()).toBeNull();
    steam.loaded = true;
    steam.ints.set('walls_destroyed', 500);
    expect(achievements.stats()).toEqual({
      castles_sealed: 0,
      walls_destroyed: 500,
      towers_bought: 0,
      towers_bought_count: 0,
    });
    achievements.setStats({
      castles_sealed: 20,
      walls_destroyed: 400,
      towers_bought: 3,
      towers_bought_count: 2,
    });
    expect(steam.ints.get('castles_sealed')).toBe(20);
    expect(steam.ints.get('walls_destroyed')).toBe(500);
    expect(steam.stores).toBe(1);
  });

  it('puts ours onto Spacewar’s on 480, and does nothing when off', () => {
    const steam = new FakeSteam();
    steam.loaded = true;
    const spacewar = new SteamAchievements(steam, 'spacewar');
    spacewar.achieve('FIRST_MATCH');
    spacewar.achieve('POCKET');
    expect([...steam.unlocked].sort()).toEqual(['ACH_HEAVY_FIRE', 'ACH_WIN_ONE_GAME']);
    spacewar.setStats({
      castles_sealed: 7,
      walls_destroyed: 9,
      towers_bought: 1,
      towers_bought_count: 1,
    });
    expect(steam.ints.get('NumGames')).toBe(7);
    expect(steam.ints.has('towers_bought_count')).toBe(false);

    const off = new FakeSteam();
    off.loaded = true;
    const none = new SteamAchievements(off, 'off');
    none.achieve('FIRST_WIN');
    expect(off.unlocked.size).toBe(0);
    expect(none.stats()).toBeNull();
    expect(none.held(['FIRST_WIN'])).toEqual([]);
  });
});
