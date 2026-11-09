import type { GuestLinkEvents } from '@bollfort/server/steamP2P';
import { describe, expect, it } from 'vitest';

import { PageLinks, type PageLinkEvent } from './pageLinks.js';

const HOST = '76561198000000001';

function setup() {
  const told: PageLinkEvent[] = [];
  const dialled: { host: string; events: GuestLinkEvents; sent: string[]; closed: boolean }[] = [];
  const links = new PageLinks(
    (host, events) => {
      const d = { host, events, sent: [] as string[], closed: false };
      dialled.push(d);
      return { send: (text) => d.sent.push(text), close: () => (d.closed = true) };
    },
    (event) => told.push(event),
  );
  return { links, told, dialled };
}

describe('a page’s links over Steam', () => {
  it('carry the page’s numbers both ways', () => {
    const { links, told, dialled } = setup();
    links.open(7, HOST);
    links.send(7, 'hello');
    dialled[0]!.events.open();
    dialled[0]!.events.message('welcome');
    expect(dialled[0]!.host).toBe(HOST);
    expect(dialled[0]!.sent).toEqual(['hello']);
    expect(told).toEqual([
      { id: 7, event: 'open' },
      { id: 7, event: 'message', text: 'welcome' },
    ]);
  });

  it('forget a link once it closes, from either end', () => {
    const { links, dialled } = setup();
    links.open(1, HOST);
    links.open(2, HOST);
    dialled[0]!.events.close();
    links.close(2);
    expect(dialled[1]!.closed).toBe(true);
    expect(links.size).toBe(0);
  });

  it('fail a link to no Steam ID, or a number already in use', () => {
    const { links, told } = setup();
    links.open(1, 'nobody');
    links.open(2, HOST);
    links.open(2, HOST);
    expect(told).toEqual([
      { id: 1, event: 'error' },
      { id: 1, event: 'close' },
      { id: 2, event: 'error' },
      { id: 2, event: 'close' },
    ]);
  });

  it('close every link as the page goes', () => {
    const { links, dialled } = setup();
    links.open(1, HOST);
    links.open(2, HOST);
    links.closeAll();
    expect(dialled.map((d) => d.closed)).toEqual([true, true]);
  });
});
