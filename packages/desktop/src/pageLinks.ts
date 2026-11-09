import type { GuestLink, GuestLinkEvents } from '@bollfort/server/steamP2P';

/** What a page's link says, as the main process sends it to the page (`steam-link`). */
export type PageLinkEvent =
  | { id: number; event: 'open' | 'close' | 'error' }
  | { id: number; event: 'message'; text: string };

/**
 * The game page's links over Steam (STEAM.md §7.3, S3.1), by the page's own numbers: the page
 * opens, sends on and closes them through its preload, and hears what they say back. Its
 * numbers are its own, so it holds a link the moment it dials, as a `Dial` must; the guest's
 * end numbers its P2P links apart. A page loaded again starts over, its old links closed.
 */
export class PageLinks {
  private readonly links = new Map<number, GuestLink>();

  constructor(
    private readonly dial: (host: string, events: GuestLinkEvents) => GuestLink,
    private readonly tell: (event: PageLinkEvent) => void,
  ) {}

  open(id: number, host: string): void {
    if (this.links.has(id) || !/^\d{1,20}$/.test(host)) {
      this.tell({ id, event: 'error' });
      this.tell({ id, event: 'close' });
      return;
    }
    const gone = (): void => {
      this.links.delete(id);
    };
    this.links.set(
      id,
      this.dial(host, {
        open: () => this.tell({ id, event: 'open' }),
        message: (text) => this.tell({ id, event: 'message', text }),
        close: () => {
          gone();
          this.tell({ id, event: 'close' });
        },
        error: () => this.tell({ id, event: 'error' }),
      }),
    );
  }

  send(id: number, text: string): void {
    this.links.get(id)?.send(text);
  }

  close(id: number): void {
    const link = this.links.get(id);
    if (link === undefined) return;
    this.links.delete(id);
    link.close();
  }

  /** Every link closed: the page went away, or loaded again. */
  closeAll(): void {
    for (const id of [...this.links.keys()]) this.close(id);
  }

  get size(): number {
    return this.links.size;
  }
}
