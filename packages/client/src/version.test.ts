import { describe, expect, it } from 'vitest';

import { versionLabel } from './version.js';

describe("the menu's version", () => {
  it('names a release by its number', () => {
    expect(versionLabel('0.11.2')).toBe('v0.11.2');
    expect(versionLabel('v0.11.2')).toBe('v0.11.2');
  });

  it('names a build between releases by the commits since and its own', () => {
    expect(versionLabel('v0.11.2-10-g1a53b02')).toBe('v0.11.2+10 · 1a53b02');
    expect(versionLabel('v0.11.2-10-g1a53b02-dirty')).toBe('v0.11.2+10 · 1a53b02-dirty');
    expect(versionLabel('v0.11.2-dirty')).toBe('v0.11.2-dirty');
  });

  it('shows anything else as it is, and nothing for no stamp', () => {
    expect(versionLabel('1a53b02')).toBe('1a53b02');
    expect(versionLabel(null)).toBe('');
    expect(versionLabel('  ')).toBe('');
  });
});
