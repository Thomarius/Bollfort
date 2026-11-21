import { barrelsOf, Structure, type Cannon, type MatchState, type Shot } from '@bollfort/sim';

/**
 * The Fortified Tower as the styles draw it (docs/SPECIAL_TOWERS.md §2.11, the user's,
 * 2026-11-21): a block of wall with a small gun on top, or two on the 3x3 — each barrel a gun of
 * its own, aiming, firing, recoiling and reloading apart. No style knows the tower: each is
 * handed a board where its tiles are wall and the tower is that many small ordinary cannons, its
 * shots each given to the gun whose barrel fired it and leaving from there. The emblem under it is
 * the towers' layer's, drawn from the match itself.
 *
 * Which barrel fired a shot the sim does not say, since nothing in the rules depends on it: a new
 * shot is given the first gun with none of the tower's shots in the air, as a barrel holds one.
 */

/**
 * A gun's footprint on the tower, in tiles: a quarter of an ordinary 2x2 cannon's, its plate drawn
 * so on the wall, the gun itself full size over it (`gunSpan`).
 */
const GUN = 1;

/**
 * The tower each display gun stands on, its footprint: a style that draws the tower round its guns
 * asks (`towerUnder`). Keyed by the display gun, made afresh with each board.
 */
const TOWER_OF = new WeakMap<Cannon, Readonly<{ x: number; y: number; w: number; h: number }>>();

/** The Fortified Tower this gun stands on, its footprint; null for any other gun. */
export function towerUnder(
  gun: Cannon,
): Readonly<{ x: number; y: number; w: number; h: number }> | null {
  return TOWER_OF.get(gun) ?? null;
}

/** A display gun's id, never a real gun's (ids count up from 0) nor an icon's (-1). */
function gunId(tower: Cannon, index: number): number {
  return index === 0 ? tower.id : -1000 - tower.id * 8 - index;
}

/** The top left corners of a tower's small guns: centred, and side by side when two. */
function gunSpots(tower: Cannon, guns: number): { x: number; y: number }[] {
  const y = tower.y + (tower.h - GUN) / 2;
  if (guns === 1) return [{ x: tower.x + (tower.w - GUN) / 2, y }];
  // Spread evenly across its width, a gap at either side as between them.
  const gap = (tower.w - guns * GUN) / (guns + 1);
  return Array.from({ length: guns }, (_, k) => ({ x: tower.x + gap + k * (GUN + gap), y }));
}

/**
 * The span a gun is drawn at, in tiles: its footprint's, but never less than an ordinary cannon's
 * (the user's, 2026-11-21: the Fortified Tower's guns full size in every style). Only the guns on
 * a Fortified Tower stand on less (`GUN`); its plate is still drawn at its footprint, so the
 * tower's wall shows round it.
 */
export function gunSpan(cannon: Pick<Cannon, 'w' | 'h'>): number {
  return Math.max(CANNON_SPAN, Math.min(cannon.w, cannon.h));
}

/** An ordinary cannon's side, in tiles. */
const CANNON_SPAN = 2;

export class FortifiedDisplay {
  /** The gun each of a Fortified Tower's shots was given, by shot id. */
  private readonly gunOf = new Map<number, number>();

  /** The board as the styles are to draw it; the match itself when no Fortified Tower stands. */
  state(state: MatchState): MatchState {
    if (!state.cannons.some((c) => c.kind === 'fortified')) {
      if (this.gunOf.size > 0) this.gunOf.clear();
      return state;
    }
    this.forget(state);
    const structure = state.structure.slice();
    for (let i = 0; i < structure.length; i++) {
      if (structure[i] === Structure.Stone) structure[i] = Structure.Wall;
    }
    const remap = new Map<number, { id: number; x: number; y: number }>();
    const cannons: Cannon[] = [];
    for (const cannon of state.cannons) {
      if (cannon.kind !== 'fortified') {
        cannons.push(cannon);
        continue;
      }
      const guns = barrelsOf(cannon);
      const spots = gunSpots(cannon, guns);
      const footprint = { x: cannon.x, y: cannon.y, w: cannon.w, h: cannon.h };
      const held: number[][] = spots.map(() => []);
      for (const shotId of cannon.shotIds) {
        const k = this.assign(cannon, shotId, guns);
        held[k]?.push(shotId);
        const at = spots[k] as { x: number; y: number };
        remap.set(shotId, { id: gunId(cannon, k), x: at.x + GUN / 2, y: at.y + GUN / 2 });
      }
      spots.forEach((at, k) => {
        const { barrels: _barrels, ...rest } = cannon;
        const gun: Cannon = {
          ...rest,
          id: gunId(cannon, k),
          kind: 'cannon',
          cost: 1,
          x: at.x,
          y: at.y,
          w: GUN,
          h: GUN,
          shotIds: held[k] as number[],
        };
        TOWER_OF.set(gun, footprint);
        cannons.push(gun);
      });
    }
    const shots = state.shots.map((shot) => {
      const to = remap.get(shot.id);
      return to === undefined ? shot : { ...shot, cannonId: to.id, fromX: to.x, fromY: to.y };
    });
    return { ...state, structure, cannons, shots };
  }

  /** A shot as the styles are to see it fired: from its own gun when a Fortified Tower's. */
  shot(shot: Shot, state: MatchState): Shot {
    const tower = state.cannons.find((c) => c.id === shot.cannonId);
    if (tower === undefined || tower.kind !== 'fortified') return shot;
    const guns = barrelsOf(tower);
    const k = this.assign(tower, shot.id, guns);
    const at = gunSpots(tower, guns)[k] as { x: number; y: number };
    return { ...shot, cannonId: gunId(tower, k), fromX: at.x + GUN / 2, fromY: at.y + GUN / 2 };
  }

  /** The gun a tower's shot came from: its own once given, else the first with none in the air. */
  private assign(tower: Cannon, shotId: number, guns: number): number {
    const known = this.gunOf.get(shotId);
    if (known !== undefined) return known;
    const busy = new Set<number>();
    for (const other of tower.shotIds) {
      const k = this.gunOf.get(other);
      if (other !== shotId && k !== undefined) busy.add(k);
    }
    let k = 0;
    while (k < guns - 1 && busy.has(k)) k++;
    this.gunOf.set(shotId, k);
    return k;
  }

  /** Lets go of shots no longer in the air, now and then. */
  private forget(state: MatchState): void {
    if (this.gunOf.size < 64) return;
    const live = new Set(state.shots.map((s) => s.id));
    for (const id of this.gunOf.keys()) if (!live.has(id)) this.gunOf.delete(id);
  }
}
