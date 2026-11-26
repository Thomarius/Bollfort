import { CAMPAIGN_MAX_PLAYERS, CampaignDifficultySchema } from '@bollfort/config';
import { z } from 'zod';

/**
 * A campaign as it is saved (docs/CAMPAIGN.md §12): its difficulty and seed, the people in it,
 * the next level to play and what is carried into it, and every level played. Saved after every
 * level and as a campaign starts, never mid-level: a level left is played again from its start,
 * which is what `carry` is.
 */

/**
 * Bumped on any change a save from before could not be read by: such saves are only deleted.
 * 2: continues and the team's firepower in place of lives and retries (2026-11-26).
 */
export const CAMPAIGN_SAVE_VERSION = 2;

const int = z.number().int();

export const LevelRecordSchema = z.strictObject({
  /** The level's index in the campaign's `levels`. */
  level: int.min(0),
  shape: z.string(),
  front: z.string().optional(),
  rounds: int.min(0),
  /** Each player's points earned in the level, its clear bonus included. */
  points: z.array(int),
  result: z.enum(['cleared', 'lost']),
  /** Ships sunk by kind, raider / transport / frost ship, and grunts killed. */
  sunk: z.tuple([int, int, int]),
  grunts: int.min(0),
});
export type LevelRecord = z.infer<typeof LevelRecordSchema>;

export const CampaignSaveSchema = z.strictObject({
  version: z.literal(CAMPAIGN_SAVE_VERSION),
  id: z.string(),
  createdAt: z.string(),
  playedAt: z.string(),
  difficulty: CampaignDifficultySchema,
  /** The campaign's; each level's seed derives from it (`levelSeed`). */
  seed: int.min(0),
  players: z
    .array(z.strictObject({ name: z.string() }))
    .min(1)
    .max(CAMPAIGN_MAX_PLAYERS),
  /** The next level to play: its place in the difficulty's `levelOrder`, 0-based. */
  stage: int.min(0),
  carry: z.strictObject({
    scores: z.array(int),
    roundsPlayed: int.min(0),
    /** The team's firepower, raised by each continue and kept from level to level (§9). */
    firepower: int.min(0),
    continuesUsed: int.min(0),
  }),
  /** The next level is a lost one played again after a continue: it opens with more cannons. */
  continued: z.boolean(),
  history: z.array(LevelRecordSchema),
  /** The last level was lost and not yet retried: the campaign opens on its defeat. */
  defeated: z.boolean(),
  /** Won, or lost with no continue left: kept as its record, its end shown when opened. */
  finished: z.boolean(),
});
export type CampaignSave = z.infer<typeof CampaignSaveSchema>;

/** A save read back: whole, or of another version, or damaged. */
export type ParsedSave =
  { ok: true; save: CampaignSave } | { ok: false; reason: 'version' | 'invalid' };

/** Reads a save, telling one of another version from a damaged one, as the tournament's does. */
export function parseCampaignSave(raw: unknown): ParsedSave {
  const parsed = CampaignSaveSchema.safeParse(raw);
  if (parsed.success) return { ok: true, save: parsed.data };
  const version = (raw as { version?: unknown } | null)?.version;
  const other = typeof version === 'number' && version !== CAMPAIGN_SAVE_VERSION;
  return { ok: false, reason: other ? 'version' : 'invalid' };
}
