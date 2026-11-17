/**
 * Where each style's own track was left, so a look coming back picks its song up where it was
 * rather than from the start (the user's, 2026-11-17): a match changes look every phase, and a
 * style chosen for building played its opening bars every round. Only the styles' tracks — the
 * shared music is drawn afresh from its variants and does not tire — and only for one match:
 * `clear` as each match begins, so a new match starts every song from the top.
 */
export class TrackPlaces {
  private readonly at = new Map<string, number>();

  /** A track let go after `seconds` of it, by its cue and file; kept only for a style's own. */
  leave(cue: string, path: string, seconds: number): void {
    if (!isStyleCue(cue) || !Number.isFinite(seconds) || seconds <= 0) return;
    this.at.set(path, seconds);
  }

  /** Where the track should start, in seconds: where it was left, or the top. */
  from(cue: string, path: string): number {
    return isStyleCue(cue) ? (this.at.get(path) ?? 0) : 0;
  }

  clear(): void {
    this.at.clear();
  }
}

function isStyleCue(cue: string): boolean {
  return cue.startsWith('style:');
}
