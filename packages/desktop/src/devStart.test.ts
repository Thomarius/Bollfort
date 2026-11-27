import { describe, expect, it } from 'vitest';

import { gameStart, SUPPORTER_DIST } from './devStart.js';

describe("the desktop app's game window", () => {
  it('serves the public build with no query by default', () => {
    expect(gameStart(['electron', '.'], false)).toEqual({ clientFolder: 'dist', query: '' });
  });

  it("takes the page's parameters as the Steam build does", () => {
    expect(gameStart(['electron', '.', '--game-params', 'perf=1'], false)).toEqual({
      clientFolder: 'dist',
      query: '?perf=1',
    });
    expect(gameStart(['electron', '.', '--game-params', 'x=<b>'], false).query).toBe('');
  });

  it('serves the supporter build and shows its styles from the repository', () => {
    expect(gameStart(['electron', '.', '--supporter'], false)).toEqual({
      clientFolder: SUPPORTER_DIST,
      query: '?supporter=1',
    });
    expect(
      gameStart(['electron', '.', '--supporter', '--game-params', 'perf=1&supporter=0'], false),
    ).toEqual({ clientFolder: SUPPORTER_DIST, query: '?perf=1&supporter=1' });
  });

  it('never does so packaged', () => {
    expect(gameStart(['bollfort', '--supporter'], true)).toEqual({
      clientFolder: 'dist',
      query: '',
    });
  });
});
