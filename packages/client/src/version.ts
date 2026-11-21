/**
 * The build's version in the menu's footer (PLAN §11 item 10, GL1): a release's number, which
 * testers can quote, or between releases the commits since the last and the commit itself.
 * Stamped by `vite.config.ts` from `BOLLFORT_VERSION`, as the release job sets it, or else
 * `git describe --tags --always --dirty`; absent in tests.
 */
declare const __BOLLFORT_VERSION__: string | null | undefined;

/** The version this build was stamped with, or null. */
export function builtVersion(): string | null {
  return typeof __BOLLFORT_VERSION__ === 'string' ? __BOLLFORT_VERSION__ : null;
}

/**
 * The footer's words for a stamp: `v0.11.2` for a release, `v0.11.2+10 · 1a53b02` ten commits
 * after it, `-dirty` kept for a tree with changes, a bare commit as it is; nothing for none.
 */
export function versionLabel(raw: string | null): string {
  const stamp = raw?.trim() ?? '';
  if (stamp === '') return '';
  const m = /^v?(\d+\.\d+\.\d+)(?:-(\d+)-g([0-9a-f]+))?(-dirty)?$/.exec(stamp);
  if (m === null) return stamp;
  const [, release, since, commit, dirty] = m;
  const base = `v${release}`;
  if (since === undefined) return dirty === undefined ? base : `${base}${dirty}`;
  return `${base}+${since} · ${commit}${dirty ?? ''}`;
}
