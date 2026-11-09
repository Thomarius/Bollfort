import { defaultConfigBundle } from '@bollfort/config';

/**
 * A game's code under Steam (STEAM.md §7.3, S3.3): the host's, their Steam account number in
 * the room codes' letters. Joining by it dials the host over P2P directly, no lobby asked, so
 * it still works where Steam's friends list fails to hand a join over, and brings a restarted
 * guest back. It shows the host's account, which a Steam profile shows anyway.
 *
 * Seven letters of the 32: one more than a server's room code, so the two never meet.
 */

/** An individual account's Steam ID is this plus its account number (universe 1, type 1). */
const INDIVIDUAL = 76561197960265728n;
const ACCOUNT_BITS = 32;

const ALPHABET = defaultConfigBundle.server.rooms.codeAlphabet;

/** Letters for any 32-bit account number in this alphabet: 7 in its 32. */
export const STEAM_CODE_LENGTH = Math.ceil(ACCOUNT_BITS / Math.log2(ALPHABET.length));

/** The code of a host's Steam ID, or null for an ID that is not a person's account. */
export function steamCodeOf(steamId: string): string | null {
  if (!/^\d{1,20}$/.test(steamId)) return null;
  let account = BigInt(steamId) - INDIVIDUAL;
  if (account < 0n || account >= 1n << BigInt(ACCOUNT_BITS)) return null;
  const base = BigInt(ALPHABET.length);
  let code = '';
  for (let i = 0; i < STEAM_CODE_LENGTH; i++) {
    code = ALPHABET[Number(account % base)] + code;
    account /= base;
  }
  return code;
}

/** The host's Steam ID a code names, or null if it is not a Steam code: typed loosely. */
export function steamIdOfCode(typed: string): string | null {
  const code = typed.trim().toUpperCase();
  if (code.length !== STEAM_CODE_LENGTH) return null;
  const base = BigInt(ALPHABET.length);
  let account = 0n;
  for (const letter of code) {
    const digit = ALPHABET.indexOf(letter);
    if (digit < 0) return null;
    account = account * base + BigInt(digit);
  }
  if (account >= 1n << BigInt(ACCOUNT_BITS)) return null;
  return (INDIVIDUAL + account).toString();
}
