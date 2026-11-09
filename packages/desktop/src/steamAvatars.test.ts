import { describe, expect, it } from 'vitest';

import { AvatarWatch, REREAD_MS, type Avatar, type AvatarSource } from './steamAvatars.js';

const BO = '76561198000000002';

const picture = (shade: number): Avatar => ({
  width: 1,
  height: 1,
  rgba: new Uint8Array([shade, shade, shade, 255]),
});
const QUESTION_MARK = picture(40);
const REAL = picture(200);

/** Steam as seen on 480: "?" at first, the real picture later. */
function setup(first: Avatar | 'loading' | null) {
  let now: Avatar | 'loading' | null = first;
  const asked: string[] = [];
  const source: AvatarSource = {
    read: () => now,
    request: (id) => {
      asked.push(id);
      return true;
    },
  };
  const published: (Avatar | null)[] = [];
  const timers: { ms: number; then: () => void }[] = [];
  const watch = new AvatarWatch(
    source,
    (_id, avatar) => published.push(avatar),
    (then, ms) => timers.push({ ms, then }),
  );
  return {
    watch,
    asked,
    published,
    timers,
    becomes: (next: Avatar | 'loading' | null) => {
      now = next;
    },
  };
}

describe('an avatar watched', () => {
  it('is published as Steam has it, then again when it changes at the player’s news', () => {
    const s = setup(QUESTION_MARK);
    s.watch.want(BO);
    expect(s.asked).toEqual([BO]);
    s.watch.personaChanged(BO); // nothing new: not published again
    s.becomes(REAL);
    s.watch.personaChanged(BO);
    expect(s.published).toEqual([QUESTION_MARK, REAL]);
  });

  it('is read again later too, for a change Steam never announces', () => {
    const s = setup('loading');
    s.watch.want(BO);
    expect(s.published).toEqual([]);
    expect(s.timers.map((t) => t.ms)).toEqual([...REREAD_MS]);
    s.becomes(REAL);
    for (const t of s.timers) t.then();
    expect(s.published).toEqual([REAL]);
  });

  it('is said again to a page asking again, and Steam asked only once', () => {
    const s = setup(REAL);
    s.watch.want(BO);
    s.watch.want(BO);
    expect(s.asked).toEqual([BO]);
    expect(s.published).toEqual([REAL, REAL]);
  });

  it('says there is none, and ignores news of players nobody wanted', () => {
    const s = setup(null);
    s.watch.personaChanged(BO);
    expect(s.published).toEqual([]);
    s.watch.want(BO);
    expect(s.published).toEqual([null]);
  });
});
