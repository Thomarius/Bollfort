import { parseCampaignSave, type CampaignSave } from '@bollfort/campaign';

/**
 * Campaigns saved on this computer (docs/CAMPAIGN.md §12), in the browser's local storage as the
 * tournaments are (`tournamentSaves.ts`): one key a campaign, found by its prefix, each written
 * whole by one `setItem`.
 */

const PREFIX = 'bollfort.campaign.';

/** A campaign found in storage: readable, or of another version, or damaged. */
export type SavedCampaign =
  | { id: string; kind: 'ok'; save: CampaignSave }
  | { id: string; kind: 'version' | 'invalid'; playedAt: string | null };

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Every saved campaign, the one played last first. */
export function savedCampaigns(area: Storage | null = storage()): SavedCampaign[] {
  if (area === null) return [];
  const out: SavedCampaign[] = [];
  for (let i = 0; i < area.length; i++) {
    const key = area.key(i);
    if (key === null || !key.startsWith(PREFIX)) continue;
    out.push(readSaved(key.slice(PREFIX.length), area.getItem(key)));
  }
  const played = (entry: SavedCampaign): string =>
    (entry.kind === 'ok' ? entry.save.playedAt : entry.playedAt) ?? '';
  return out.sort((a, b) => played(b).localeCompare(played(a)));
}

function readSaved(id: string, text: string | null): SavedCampaign {
  let raw: unknown = null;
  try {
    raw = JSON.parse(text ?? 'null');
  } catch {
    // Not JSON at all: damaged.
  }
  const parsed = parseCampaignSave(raw);
  if (parsed.ok) return { id, kind: 'ok', save: parsed.save };
  const playedAt = (raw as { playedAt?: unknown } | null)?.playedAt;
  return { id, kind: parsed.reason, playedAt: typeof playedAt === 'string' ? playedAt : null };
}

export function loadCampaign(id: string, area: Storage | null = storage()): CampaignSave | null {
  const entry = readSaved(id, area?.getItem(PREFIX + id) ?? null);
  return entry.kind === 'ok' ? entry.save : null;
}

/** Saves a campaign whole. False when the browser refused, which the player must be told. */
export function writeCampaign(save: CampaignSave, area: Storage | null = storage()): boolean {
  if (area === null) return false;
  try {
    area.setItem(PREFIX + save.id, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function deleteCampaign(id: string, area: Storage | null = storage()): void {
  try {
    area?.removeItem(PREFIX + id);
  } catch {
    // Refused: nothing was deleted, and the list shows it still there.
  }
}

/** A new campaign's id: its start in base 36 and a random tail, safe as a key. */
export function newCampaignId(now: Date): string {
  const tail = Math.floor(Math.random() * 0xffffffff).toString(36);
  return `c-${now.getTime().toString(36)}-${tail}`;
}
