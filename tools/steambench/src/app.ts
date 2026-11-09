// The app under test on one machine, behind one shape (STEAM.md 3.4): start, host, join, the
// game page, the log, the counters, stop. Made for the S1 spike, whose adapter went with it once
// the Steam build passed the bench (2026-11-09, ARCHIVE 15zs); `SteamApp` is the one left.
import type { Page } from 'playwright';

import { sleep, type Machine } from './machines.js';

/** The app's state, as the spike's control window received it; `SteamApp` reads the same. */
export interface AppState {
  name: string | null;
  steamId: string | null;
  role: 'none' | 'host' | 'guest';
  lobby: string | null;
  room: string | null;
  rtt: number | null;
  rttMax: number | null;
  rttMean: number | null;
  rttSum: number;
  rttCount: number;
  stalls: number;
  longestStallMs: number;
  sentPackets: number;
  sendFailures: number;
  largestPacket: number;
  socketsOpened: number;
  socketsOpenedInMatch: number;
  logFile: string | null;
  initError: string | null;
}

/** The app under test as the scenarios drive it. */
export interface AppUnderTest {
  readonly machine: Machine;
  readonly label: string;
  start(args: readonly string[]): Promise<void>;
  state(ms?: number): Promise<AppState | null>;
  /** `list` (the public lobbies, `{ id }`) and `join` (a lobby by its ID), as the spike names them. */
  call(name: string, ...args: unknown[]): Promise<unknown>;
  host(type: 'friends' | 'public' | 'private'): Promise<string>;
  game(ms?: number): Promise<Page | null>;
  lines(): string[];
  waitLog(re: RegExp, ms: number, from?: number): Promise<RegExpMatchArray | null>;
  stop(): Promise<void>;
}

/** A promise given up after `ms`: a page across a cut network never answers. */
export function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise.catch(() => fallback), sleep(ms).then(() => fallback)]);
}
