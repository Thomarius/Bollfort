import { describe, expect, it } from 'vitest';

import { shouldOfferTutorial } from './offer.js';

const FIRST = { offered: false, done: false, automated: false, forced: false };

describe('the tutorial offered on a first start', () => {
  it('is offered once, to somebody new', () => {
    expect(shouldOfferTutorial(FIRST)).toBe(true);
    expect(shouldOfferTutorial({ ...FIRST, offered: true })).toBe(false);
  });

  it('is not offered to somebody who has played it from the menu', () => {
    expect(shouldOfferTutorial({ ...FIRST, done: true })).toBe(false);
  });

  it('stays out of the screenshot tools’ way, unless asked for', () => {
    expect(shouldOfferTutorial({ ...FIRST, automated: true })).toBe(false);
    expect(shouldOfferTutorial({ ...FIRST, automated: true, forced: true })).toBe(true);
  });
});
