/**
 * Whether the supporter styles are shown (STEAM.md §6.1, SP1b): the admin mode, for the developer
 * with the private package checked out. A page asks for it with `?supporter=1`, which is not
 * saved — so a look chosen in it falls back to the default on the next page, as any unknown
 * style does — and Node (a tool, a test) with `BOLLFORT_SUPPORTER=1`. Without the package the
 * lists are empty (`supporter.ts`), and asking changes nothing.
 */
export function supporterAdmin(): boolean {
  const search = globalThis.location?.search;
  if (search !== undefined) return new URLSearchParams(search).get('supporter') === '1';
  // The page's own type knows no `process`; Node's is read only where there is one.
  const node = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return node.process?.env?.['BOLLFORT_SUPPORTER'] === '1';
}
