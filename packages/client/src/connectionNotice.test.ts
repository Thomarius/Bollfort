import { describe, expect, it } from 'vitest';

import { noticeFor } from './connectionNotice.js';

describe('the notice over a match whose connection is down', () => {
  it('covers the board while the seat is being got back, and offers the menu once lost', () => {
    expect(noticeFor('open', false)).toBe('none');
    expect(noticeFor('reconnecting', false)).toBe('retrying');
    expect(noticeFor('lost', false)).toBe('gone');
  });

  it('says the host has left, the match over with them (STEAM.md §7.3)', () => {
    expect(noticeFor('hostLeft', false)).toBe('hostLeft');
  });

  it('leaves the summary alone: its way back to the menu is already there', () => {
    expect(noticeFor('reconnecting', true)).toBe('none');
    expect(noticeFor('lost', true)).toBe('none');
  });
});
