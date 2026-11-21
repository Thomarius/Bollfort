/**
 * Text shrunk just enough to keep to one line in its box: the end screen's award titles, whose
 * German ("Großgrundbesitz", "Erzfeind von Bot 3") ran past their cards in the looks with a wide
 * heading face, or wrapped in every look (2026-11-21, ARCHIVE 16v).
 */

/** The smallest a fitted title is set; anything still too wide there wraps as before. */
export const FIT_FLOOR_PX = 11;

/** Shrinks tried before a title is left as it stands; two sufficed in every look measured. */
const FIT_PASSES = 4;

/**
 * The font size, in pixels, that fits text `needed` pixels wide at `size` into `available`:
 * `size` itself when it fits, scaled down by the ratio when not — as if all of its width
 * scaled with its size, which `fitTitles` checks — never below `floor`; `null` when even the
 * floor is too wide, or there is
 * nothing to measure (a box not laid out). Rounded down to a tenth, so it errs on fitting.
 */
export function fittedSize(
  size: number,
  needed: number,
  available: number,
  floor = FIT_FLOOR_PX,
): number | null {
  if (available <= 0 || needed <= 0) return null;
  if (needed <= available) return size;
  const fitted = Math.floor(((size * available) / needed) * 10) / 10;
  return fitted >= floor ? fitted : null;
}

/**
 * Each `span` of `selector` under `root` fitted to one line: CSS keeps it to one line and
 * clips it (`white-space: nowrap`, `min-width: 0`), so its own width is what its box allows and
 * its scroll width what its text needs. One that cannot fit at the floor is marked `wraps`.
 */
export function fitTitles(root: ParentNode, selector: string): void {
  for (const title of root.querySelectorAll<HTMLElement>(selector)) {
    title.style.fontSize = '';
    title.classList.remove('wraps');
    // Hidden or folded away: measured again when shown, by the caller.
    if (title.clientWidth === 0) continue;
    // Measured again after each shrink: not all of a title's width scales with its size — a
    // letter spacing set in `em` on the heading reaches the span as fixed pixels (0.64 px a
    // letter left "Großgrundbesitz" 9 px too wide after one pass).
    for (let pass = 0; pass < FIT_PASSES; pass++) {
      const size = parseFloat(getComputedStyle(title).fontSize);
      const fitted = fittedSize(size, title.scrollWidth, title.clientWidth);
      if (fitted === null) {
        title.style.fontSize = '';
        title.classList.add('wraps');
        break;
      }
      if (fitted === size) break;
      title.style.fontSize = `${fitted}px`;
    }
  }
}
