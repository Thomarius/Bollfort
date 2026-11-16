import { describe, expect, it } from 'vitest';

import { saveBuildZoom } from './buildZoomSetting.js';
import {
  parseMouseWheel,
  saveMouseWheel,
  storedMouseWheel,
  wheelZooms,
} from './mouseWheelSetting.js';

describe('the mouse wheel setting', () => {
  it('turns the piece unless asked to zoom, and reads nothing else', () => {
    expect(storedMouseWheel()).toBe('turn');
    expect(parseMouseWheel('zoom')).toBe('zoom');
    expect(parseMouseWheel('spin')).toBeNull();
  });

  it('zooms only while the island zoom is on, and turns the piece again where it is off', () => {
    saveMouseWheel('zoom');
    saveBuildZoom('out');
    expect(wheelZooms()).toBe(true);
    saveBuildZoom('off');
    expect(wheelZooms()).toBe(false);
    saveMouseWheel('turn');
    saveBuildZoom('in');
    expect(wheelZooms()).toBe(false);
  });
});
