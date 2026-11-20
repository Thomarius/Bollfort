import { defaultArtConfig, defaultRuleset, type ArtStyle } from '@bollfort/config';
import {
  applyEnclosure,
  computeEnclosure,
  stateFromAscii,
  withSpecials,
  type MatchState,
} from '@bollfort/sim';

import { Application, Container, Graphics } from 'pixi.js';

import { PARKED, QUADCOPTER, type DroneLook } from './render/drones.js';
import { createTheme, Scene } from './render/scene.js';
import { hex, playerColour } from './render/theme.js';
import { STYLE_IDS, isStyle, styleArt } from './styles/registry.js';

/**
 * Every style's drones (`?drones=preview`, a developer's page, 2026-11-20): a Drone Tower of
 * three on a sealed island in each style, its drones parked between barrages and in orbit in
 * combat. Above, one style live, its drones flying and parking by turns; below, every style, a
 * still of each, cropped round the tower. Through a real `Scene`, as the shots' page is, so what is
 * shown is the style's own ground under the drones the towers' layer draws.
 */
const BOARD = `
  ............
  .,,,,,,,,,,.
  .,########,.
  .,#,,,,,,#,.
  .,#,,DD,,#,.
  .,#,,DD,,#,.
  .,#,,,,,,#,.
  .,#,,@@,,#,.
  .,#,,@@,,#,.
  .,########,.
  .,,,,,,,,,,.
  ............
`;
const WIDTH = 12;
const HEIGHT = 12;
const SEED = 5;
/** The stills' crop round the tower, in tiles: its orbit and a drone's span beyond it. */
const CROP = { x: 3.4, y: 2.9, w: 5.2, h: 4.2 };
/** The live view's turns between flying and parked, in seconds. */
const TURN_S = 4;

function previewState(phase: 'build' | 'combat'): MatchState {
  const state = stateFromAscii(BOARD, withSpecials(defaultRuleset));
  state.seed = SEED;
  state.round = 5;
  state.phase = phase;
  state.phaseEndTick = Number.MAX_SAFE_INTEGER;
  for (const player of state.players) {
    const castle = state.castles.find((c) => c.islandId === player.islandId);
    player.startingCastleId = castle?.id ?? null;
  }
  applyEnclosure(state);
  return state;
}

interface Board {
  scene: Scene;
  state: MatchState;
  sealed: readonly boolean[];
}

async function board(style: ArtStyle, tile: number, phase: 'build' | 'combat'): Promise<Board> {
  const canvas = document.createElement('canvas');
  const scene = new Scene();
  const look = { theme: await createTheme(style, SEED), art: styleArt(defaultArtConfig, style) };
  await scene.init(canvas, { build: look, combat: look }, defaultArtConfig);
  const state = previewState(phase);
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

/** A still of the tower cropped from a board, parked or at `tick` of its orbit. */
async function renderStill(
  style: ArtStyle,
  tile: number,
  phase: 'build' | 'combat',
  tick: number,
): Promise<string> {
  const b = await board(style, tile, phase);
  try {
    for (let k = 0; k < 6; k++) frame(b, 0, 250);
    b.state.tick = tick;
    frame(b, 0, 16);
    const whole = b.scene.app.canvas.toDataURL('image/png');
    const img = new Image();
    img.src = whole;
    await img.decode();
    const crop = document.createElement('canvas');
    crop.width = Math.round(CROP.w * tile);
    crop.height = Math.round(CROP.h * tile);
    const scale = img.width / (WIDTH * tile);
    crop
      .getContext('2d')!
      .drawImage(
        img,
        CROP.x * tile * scale,
        CROP.y * tile * scale,
        CROP.w * tile * scale,
        CROP.h * tile * scale,
        0,
        0,
        crop.width,
        crop.height,
      );
    return crop.toDataURL('image/png');
  } finally {
    b.scene.app.destroy({ removeView: true });
  }
}

/** The enlarged models' tile size and each pose's cell, in pixels. */
const MODEL_TILE = 120;
const MODEL_CELL = 104;
let modelApp: Application | null = null;

/**
 * One style's drone enlarged, every pose of its beat and then parked, nose to the right, in its
 * first player's colour on its own grass: the drawing itself, which the board shows at its size.
 */
async function renderModels(style: ArtStyle): Promise<string> {
  const theme = await createTheme(style, SEED);
  const look: DroneLook = theme.drone ?? QUADCOPTER;
  theme.destroy();
  const art = styleArt(defaultArtConfig, style);
  const poses = [...Array.from({ length: look.frames ?? 1 }, (_, k) => k), PARKED];
  if (modelApp === null) {
    modelApp = new Application();
    await modelApp.init({ width: 8, height: 8, antialias: true, preserveDrawingBuffer: true });
  }
  const app = modelApp;
  app.renderer.resize(poses.length * MODEL_CELL, MODEL_CELL);
  const stage = new Container();
  const tint = playerColour(art, 0, 'light');
  poses.forEach((pose, i) => {
    const cell = new Graphics();
    cell.rect(i * MODEL_CELL + 1, 1, MODEL_CELL - 2, MODEL_CELL - 2);
    cell.fill({ color: hex(art.palette.grassMid) });
    stage.addChild(cell);
    const layers = look.markUnder
      ? (['mark', 'body', 'ink'] as const)
      : (['body', 'mark', 'ink'] as const);
    for (const layer of layers) {
      const draw = look[layer];
      if (draw === undefined) continue;
      const g = new Graphics();
      draw.call(look, g, MODEL_TILE, pose);
      g.position.set(i * MODEL_CELL + MODEL_CELL / 2, MODEL_CELL / 2);
      if (pose === PARKED) g.scale.set(look.parkedScale ?? 0.8);
      if (layer === 'mark') g.tint = tint;
      stage.addChild(g);
    }
  });
  app.renderer.render(stage);
  const url = (app.renderer.canvas as HTMLCanvasElement).toDataURL('image/png');
  stage.destroy({ children: true });
  return url;
}

async function runLive(
  host: HTMLElement,
  style: ArtStyle,
  tile: number,
): Promise<{ stop: () => void }> {
  host.innerHTML = '';
  const b = await board(style, tile, 'combat');
  host.append(b.scene.app.canvas);
  for (let k = 0; k < 6; k++) frame(b, 0, 250);
  let stopped = false;
  let last = performance.now();
  let ticks = 0;
  const rate = b.state.ruleset.tickRateHz;
  const loop = (now: number): void => {
    if (stopped) return;
    const delta = Math.min(100, now - last);
    last = now;
    ticks += (delta * rate) / 1000;
    b.state.tick = Math.floor(ticks);
    b.state.phase = Math.floor(ticks / rate / TURN_S) % 2 === 0 ? 'combat' : 'build';
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

export async function showDronePreview(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const tile = Number(params.get('tile') ?? 48);
  const stillTile = Number(params.get('stillTile') ?? 40);
  /** The tick the in-orbit stills are taken at, so a beat can be looked at frame by frame. */
  const at = Number(params.get('tick') ?? 37);
  const asked = params.get('style');
  const first = isStyle(asked) ? asked : 'flat';
  const only = (params.get('only') ?? '').split(',').filter(isStyle);
  const stills = only.length > 0 ? only : STYLE_IDS;

  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#1a1a24;overflow:auto';
  const page = document.createElement('div');
  page.style.cssText = 'padding:12px;font:13px sans-serif;color:#e8e4d8';
  document.body.append(page);

  const heading = document.createElement('div');
  heading.innerHTML =
    "<b>Drones</b> — each style's drone enlarged, every frame of its beat and then parked; " +
    'then a Drone Tower of three on its own island, parked and in orbit. ' +
    `The live view turns between the two every ${TURN_S} s.`;
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
  if (params.get('live') !== '0') await choose(first);
  else live.remove();

  const w = Math.round(CROP.w * stillTile);
  const sheet = document.createElement('div');
  sheet.className = 'drone-sheet';
  sheet.style.cssText = 'margin-top:18px;display:flex;flex-direction:column;gap:10px';
  page.append(sheet);
  for (const style of stills) {
    const card = document.createElement('div');
    card.className = 'drone-card';
    card.style.cssText = 'display:flex;gap:12px;align-items:center';
    const label = document.createElement('div');
    label.textContent = style;
    label.style.cssText = 'width:90px;font-weight:bold';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;align-items:center';
    const models = document.createElement('img');
    models.src = await renderModels(style);
    models.style.cssText = 'display:block;margin-right:12px';
    row.append(models);
    for (const [phase, tick] of [
      ['build', 0],
      ['combat', at],
    ] as const) {
      const img = document.createElement('img');
      img.src = await renderStill(style, stillTile, phase, tick);
      img.style.cssText = `display:block;width:${w}px`;
      row.append(img);
    }
    card.append(label, row);
    sheet.append(card);
  }
  page.dataset['done'] = '1';
}
