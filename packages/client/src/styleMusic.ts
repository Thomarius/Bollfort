import { styleTrack, type ArtStyle, type MusicCue, type MusicTrack } from '@bollfort/config';

/**
 * Which track a look plays as it starts (ARCHIVE 14za, reworked 2026-11-17 by the user's rule).
 *
 * Kept pure, as `banners.ts` and `scores.ts` are, so the rule can be tested without a browser.
 */

/** The player's choice, and which styles have a track at all. */
export interface StyleTrackRules {
  /** On: a style's own track wherever the rule allows (`styleMusicSetting.ts`); off: never. */
  on: boolean;
  hasTrack: (style: ArtStyle) => boolean;
}

/**
 * The track for a look starting in `style`, whose shared music is `shared`, after the look that
 * played `previous` (null at a match's start). On, the style's own track, if it has one — but **the
 * music must change at every change of look** (the user's, 2026-11-17): so where the style's own is
 * the track that just played, as when building and combat are drawn in the same style, the shared
 * music plays instead. Off, always the shared music, which alternates by itself.
 */
export function lookTrack(
  style: ArtStyle,
  shared: MusicCue,
  previous: MusicTrack | null,
  rules: StyleTrackRules,
): MusicTrack {
  if (!rules.on || !rules.hasTrack(style)) return shared;
  const own = styleTrack(style);
  return own === previous ? shared : own;
}
