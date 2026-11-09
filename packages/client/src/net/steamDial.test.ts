import { describe, expect, it } from 'vitest';

import type { GameHost, HostLinkEvent } from '../host.js';
import { steamDial } from './steamDial.js';

const HOST = '76561198000000001';

/** The app's side of the bridge, kept by hand: what the page asked, and a way to answer. */
function fakeHost() {
  const asked: string[] = [];
  let listener: (event: HostLinkEvent) => void = () => undefined;
  const host = {
    linkOpen: (id: number, to: string) => asked.push(`open ${id} ${to}`),
    linkSend: (id: number, text: string) => asked.push(`send ${id} ${text}`),
    linkClose: (id: number) => asked.push(`close ${id}`),
    onLink: (l: (event: HostLinkEvent) => void) => {
      listener = l;
    },
  } as unknown as GameHost;
  return { host, asked, say: (event: HostLinkEvent) => listener(event) };
}

describe('a link dialled over Steam', () => {
  it('opens to the host’s Steam ID and passes on what it says', () => {
    const { host, asked, say } = fakeHost();
    const heard: string[] = [];
    const dial = steamDial(host);
    const link = dial(HOST, {
      open: () => heard.push('open'),
      message: (text) => heard.push(text),
      close: () => heard.push('close'),
      error: () => heard.push('error'),
    });
    link.send('hello');
    say({ id: 1, event: 'open' });
    say({ id: 1, event: 'message', text: 'welcome' });
    say({ id: 2, event: 'message', text: 'not ours' });
    say({ id: 1, event: 'close' });
    link.send('too late');
    link.close();
    expect(asked).toEqual([`open 1 ${HOST}`, 'send 1 hello']);
    expect(heard).toEqual(['open', 'welcome', 'close']);
  });

  it('numbers each link afresh, and closes one from the page', () => {
    const { host, asked } = fakeHost();
    const dial = steamDial(host);
    const none = { open() {}, message() {}, close() {}, error() {} };
    dial(HOST, none);
    dial(HOST, none).close();
    expect(asked).toEqual([`open 1 ${HOST}`, `open 2 ${HOST}`, 'close 2']);
  });
});
