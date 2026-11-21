import { describe, expect, it } from 'vitest';

import { shouldAskName, type NameAskFacts } from './namePrompt.js';

const newcomer: NameAskFacts = {
  steam: false,
  asked: false,
  typed: false,
  automated: false,
  forced: false,
};

describe('the name, asked once', () => {
  it('asks a newcomer', () => {
    expect(shouldAskName(newcomer)).toBe(true);
  });

  it('asks nobody twice, nor anyone who typed a name before', () => {
    expect(shouldAskName({ ...newcomer, asked: true })).toBe(false);
    expect(shouldAskName({ ...newcomer, typed: true })).toBe(false);
  });

  it('never asks under Steam, even when forced', () => {
    expect(shouldAskName({ ...newcomer, steam: true })).toBe(false);
    expect(shouldAskName({ ...newcomer, steam: true, forced: true })).toBe(false);
  });

  it('leaves a scripted browser alone unless asked to show it', () => {
    expect(shouldAskName({ ...newcomer, automated: true })).toBe(false);
    expect(shouldAskName({ ...newcomer, automated: true, asked: true, forced: true })).toBe(true);
  });
});
