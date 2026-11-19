import { defaultArtConfig, defaultRuleset, type ArtStyle } from '@bollfort/config';
import {
  applyEnclosure,
  computeEnclosure,
  stateFromAscii,
  withSpecials,
  type MatchState,
  type Shot,
} from '@bollfort/sim';

import { createTheme, Scene } from './render/scene.js';
import { STYLE_IDS, isStyle, styleArt } from './styles/registry.js';

/**
 * Every style's shots side by side (`?shots=preview`, a developer's page, 2026-11-19): an
 * ordinary cannon's, Big Bertha's and the Allerdickste Bertha's, each fired from its own gun
 * across a channel at a rival's wall. Above, one style live, chosen by its button, the shots
 * looping; below, every style, a still frame each with the shots halfway. Through a real
 * `Scene`, as the menu's pictures are, so what is shown is the style's own drawing.
 */
const BOARD = `
  ...............................
  .,,,,,,,,,,,,......,,,,,,,,,,,.
  .,##########,......,#########,.
  .,#,,,,,,**#,......,#,,,,,,,#,.
  .,#,@@,,,**#,......,#,,,@@,,#,.
  .,#,@@,,,BB#,......,#,,,@@,,#,.
  .,#,,,,,,BB#,......,#,,,,,,,#,.
  .,#,,,,,,GG#,......,#,,,,,,,#,.
  .,#,,,,,,GG#,......,#,,,,,,,#,.
  .,##########,......,#########,.
  .,,,,,,,,,,,,......,,,,,,,,,,,.
  ...............................
`;
/** Where the rival's island begins: everything from this column on is theirs. */
const RIVAL_FROM = 19;
/** The rival's west wall, each shot at its gun's row. */
const WALL_X = 20;
const WIDTH = 31;
const HEIGHT = 12;
const SEED = 5;
/** A shot's flight, in ticks; the stills show it at `STILL_AT` of the way. */
const FLIGHT_TICKS = 60;
const STILL_AT = 0.5;
/** Between one volley landing and the next. */
const PAUSE_MS = 500;

export function shotPreviewState(): MatchState {
  const rows = BOARD.split('\n');
  const islands = rows
    .map((row) =>
      [...row]
        .map((c, x) => {
          const at = x - (row.length - row.trimStart().length);
          return at >= RIVAL_FROM && c !== '.' && c !== ' ' ? '2' : c === ' ' ? ' ' : '.';
        })
        .join(''),
    )
    .join('\n');
  const state = stateFromAscii(BOARD, withSpecials(defaultRuleset), islands);
  state.seed = SEED;
  state.round = 5;
  state.phase = 'combat';
  state.phaseEndTick = Number.MAX_SAFE_INTEGER;
  for (const player of state.players) {
    const castle = state.castles.find((c) => c.islandId === player.islandId);
    player.startingCastleId = castle?.id ?? null;
  }
  applyEnclosure(state);
  return state;
}

/** One volley: a shot from each of the first player's guns, at the wall level with it. */
export function volley(state: MatchState, launchTick: number, firstId: number): Shot[] {
  return state.cannons
    .filter((c) => c.owner === 0)
    .map((cannon, k) => {
      const fromX = cannon.x + (cannon.w - 1) / 2;
      const fromY = cannon.y + (cannon.h - 1) / 2;
      return {
        id: firstId + k,
        cannonId: cannon.id,
        kind: cannon.kind,
        cost: cannon.cost,
        owner: cannon.owner,
        fromX,
        fromY,
        toX: WALL_X,
        toY: cannon.y,
        launchTick,
        impactTick: launchTick + FLIGHT_TICKS,
      };
    });
}

interface Board {
  scene: Scene;
  state: MatchState;
  sealed: readonly boolean[];
}

async function board(style: ArtStyle, tile: number): Promise<Board> {
  const canvas = document.createElement('canvas');
  const scene = new Scene();
  const look = { theme: await createTheme(style, SEED), art: styleArt(defaultArtConfig, style) };
  await scene.init(canvas, { build: look, combat: look }, defaultArtConfig);
  const state = shotPreviewState();
  const enclosure = computeEnclosure(state);
  scene.resize(state, WIDTH * tile, HEIGHT * tile);
  scene.showLooks({ from: 'combat', to: 'combat', lineY: null });
  scene.drawTerrain(state);
  scene.drawTerritory(state, { build: enclosure.territory, combat: enclosure.territory });
  scene.drawStructures(state);
  return { scene, state, sealed: enclosure.castleEnclosed };
}

function frame(b: Board, fraction: number, deltaMs: number): void {
  b.scene.drawEffects(b.state, fraction, deltaMs, { build: b.sealed, combat: b.sealed });
  b.scene.render();
}

function fire(b: Board, launchTick: number, firstId: number): void {
  b.state.shots = volley(b.state, launchTick, firstId);
  for (const shot of b.state.shots) b.scene.noteShot(shot);
}

async function renderStill(style: ArtStyle, tile: number): Promise<string> {
  const b = await board(style, tile);
  try {
    // A few long frames first, so the flags are up and what settles has settled.
    for (let k = 0; k < 6; k++) frame(b, 0, 250);
    b.state.tick = 0;
    fire(b, 0, 1);
    // Up to the still's moment in steps, so a style tracing its shots' trails has them.
    const at = Math.round(FLIGHT_TICKS * STILL_AT);
    for (let tick = 1; tick <= at; tick++) {
      b.state.tick = tick;
      frame(b, 0, 1000 / b.state.ruleset.tickRateHz);
    }
    return b.scene.app.canvas.toDataURL('image/png');
  } finally {
    b.scene.app.destroy({ removeView: true });
  }
}

async function runLive(
  host: HTMLElement,
  style: ArtStyle,
  tile: number,
): Promise<{ stop: () => void }> {
  host.innerHTML = '';
  const b = await board(style, tile);
  host.append(b.scene.app.canvas);
  for (let k = 0; k < 6; k++) frame(b, 0, 250);
  let stopped = false;
  let last = performance.now();
  let ticks = 0;
  let rest = PAUSE_MS / 2;
  let fired = 0;
  const rate = b.state.ruleset.tickRateHz;
  const loop = (now: number): void => {
    if (stopped) return;
    const delta = Math.min(100, now - last);
    last = now;
    ticks += (delta * rate) / 1000;
    b.state.tick = Math.floor(ticks);
    const first = b.state.shots[0];
    if (first !== undefined && b.state.tick >= first.impactTick) {
      for (const shot of b.state.shots) b.scene.noteImpact(shot.toX, shot.toY, []);
      b.state.shots = [];
      rest = PAUSE_MS;
    } else if (first === undefined) {
      rest -= delta;
      if (rest <= 0) {
        fire(b, b.state.tick, 1 + fired * 3);
        fired++;
      }
    }
    frame(b, ticks - b.state.tick, delta);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return {
    stop: () => {
      stopped = true;
      b.scene.app.destroy({ removeView: true });
    },
  };
}

export async function showShotPreview(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const tile = Number(params.get('tile') ?? 32);
  const stillTile = Number(params.get('stillTile') ?? 16);
  const asked = params.get('style');
  const first = isStyle(asked) ? asked : 'flat';
  // `&only=a,b` limits the stills to those styles.
  const only = (params.get('only') ?? '').split(',').filter(isStyle);
  const stills = only.length > 0 ? only : STYLE_IDS;

  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#1a1a24;overflow:auto';
  const page = document.createElement('div');
  page.style.cssText = 'padding:12px;font:13px sans-serif;color:#e8e4d8';
  document.body.append(page);

  const heading = document.createElement('div');
  heading.innerHTML =
    "<b>Shots</b> — from the top: an ordinary cannon's, Big Bertha's, the Allerdickste " +
    "Bertha's.";
  page.append(heading);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:8px 0';
  page.append(buttons);
  const live = document.createElement('div');
  page.append(live);

  let running: { stop: () => void } | null = null;
  const choose = async (style: ArtStyle): Promise<void> => {
    running?.stop();
    for (const b of buttons.children) {
      (b as HTMLElement).style.background =
        (b as HTMLElement).dataset['style'] === style ? '#556' : '#2a2a38';
    }
    running = await runLive(live, style, tile);
  };
  for (const style of STYLE_IDS) {
    const b = document.createElement('button');
    b.textContent = style;
    b.dataset['style'] = style;
    b.style.cssText = 'color:#e8e4d8;border:1px solid #556;padding:3px 8px;cursor:pointer';
    b.onclick = () => void choose(style);
    buttons.append(b);
  }
  await choose(first);

  const sheet = document.createElement('div');
  sheet.style.cssText =
    `margin-top:18px;display:grid;gap:4px 6px;align-items:center;` +
    `grid-template-columns:repeat(2,84px ${WIDTH * stillTile}px)`;
  page.append(sheet);
  for (const style of stills) {
    const label = document.createElement('div');
    label.textContent = style;
    const img = document.createElement('img');
    img.src = await renderStill(style, stillTile);
    img.style.cssText = `display:block;width:${WIDTH * stillTile}px`;
    sheet.append(label, img);
  }
  page.dataset['done'] = '1';
}
