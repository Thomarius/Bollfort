import { describe, expect, it } from 'vitest';

import { connectLobby, savedFullscreen, serverPorts, startPlan, SPACEWAR } from './steam.js';

describe('the Steam build starting', () => {
  it('goes without the sandbox on Linux only', () => {
    expect(startPlan('linux', [], SPACEWAR).noSandbox).toBe(true);
    expect(startPlan('win32', [], SPACEWAR).noSandbox).toBe(false);
  });

  it('starts itself again on Linux when the switch is not on its command line', () => {
    expect(startPlan('linux', ['bollfort'], SPACEWAR).relaunch).toBe(true);
    expect(startPlan('linux', ['bollfort', '--no-sandbox'], SPACEWAR).relaunch).toBe(false);
    expect(startPlan('win32', ['bollfort'], SPACEWAR).relaunch).toBe(false);
  });

  it('asks Steam to restart it only under our own App ID', () => {
    expect(startPlan('win32', [], SPACEWAR).restartCheck).toBe(false);
    expect(startPlan('win32', [], 3_000_000).restartCheck).toBe(true);
  });

  it('takes the lobby an invite started it for', () => {
    const argv = ['/opt/bollfort/bollfort', '+connect_lobby', '109775243983341875'];
    expect(startPlan('linux', argv, SPACEWAR).connectLobby).toBe('109775243983341875');
    expect(connectLobby(['bollfort'])).toBeNull();
    expect(connectLobby(['bollfort', '+connect_lobby'])).toBeNull();
    expect(connectLobby(['bollfort', '+connect_lobby', '--no-sandbox'])).toBeNull();
  });

  it('opens fullscreen unless the player left it', () => {
    expect(savedFullscreen(null)).toBe(true);
    expect(savedFullscreen({})).toBe(true);
    expect(savedFullscreen({ fullscreen: 'no' })).toBe(true);
    expect(savedFullscreen({ fullscreen: false })).toBe(false);
    expect(savedFullscreen({ fullscreen: true })).toBe(true);
  });

  it("tries the config's port and those above it", () => {
    expect(serverPorts(8080, 3)).toEqual([8080, 8081, 8082]);
    expect(serverPorts(65534, 5)).toEqual([65534, 65535]);
  });
});
