import { defaultArtConfig, type ArtStyle, type ShipKind } from '@bollfort/config';
import {
  applyEnclosure,
  campaignLevelRuleset,
  computeEnclosure,
  stateFromAscii,
  type MatchState,
} from '@bollfort/sim';

import { Application, Container, Graphics } from 'pixi.js';

import { drawGrunt, drawShip } from './render/campaignMarks.js';
import { createTheme, Scene } from './render/scene.js';
import { hex } from './render/theme.js';
import { STYLE_IDS, isStyle, styleArt } from './styles/registry.js';

/**
 * Every style's campaign enemy (`?fleet=preview`, a developer's page, CAMPAIGN CA15): each
 * style's ships and grunts enlarged on its own sea and grass — the three kinds, a ship hit twice
 * and four times, a grunt standing and smashing — and then the fleet on a board of the style's
 * own, through a real `Scene`, ships at three headings off an island with grunts ashore. A style
 * without a fleet of its own shows the plain one every such style shares. `&only=a,b` some styles.
 */
const BOARD = `
  ..................
  .SS.....SS.....SS.
  .SS.....SS.....SS.
  ..................
  ..,,,,,,,,,,,,,,..
  ..,m,########,m,..
  ..,,,#,,,,,,#,,,..
  ..,,,#,,@@,,#,,,..
  ..,,,#,,@@,,#,,,..
  ..,m,########,m,..
  ..,,,,,,,,,,,,,,..
  ..................
`;
const WIDTH = 18;
const HEIGHT = 12;
const SEED = 5;

/** The ships on the board: each kind, a heading straight, one diagonal, one hit. */
const SHIPS: readonly { kind: ShipKind; heading: number; hits: number }[] = [
  { kind: 'raider', heading: 2, hits: 0 },
  { kind: 'transport', heading: 3, hits: 1 },
  { kind: 'frostship', heading: 4, hits: 2 },
];

/** The fleet's shots in flight: from which ship, where to, and how far along, of a flight in ticks. */
const SHOTS: readonly { ship: number; toX: number; toY: number; at: number }[] = [
  { ship: 0, toX: 6, toY: 5, at: 0.45 },
  { ship: 2, toX: 12, toY: 6, at: 0.6 },
];
const FLIGHT = 60;

function previewState(): MatchState {
  const state = stateFromAscii(BOARD, campaignLevelRuleset());
  state.seed = SEED;
  state.round = 3;
  state.phase = 'combat';
  state.phaseEndTick = Number.MAX_SAFE_INTEGER;
  for (const player of state.players) {
    const castle = state.castles.find((c) => c.islandId === player.islandId);
    player.startingCastleId = castle?.id ?? null;
  }
  const fleet = state.campaign;
  if (fleet !== null) {
    fleet.ships.forEach((ship, i) => Object.assign(ship, SHIPS[i] ?? {}, { arrivedTick: -1000 }));
    fleet.grunts.forEach((grunt, i) => (grunt.facing = i % 4));
    // Two of the ships' shots in flight towards the wall, drawn as the style's own cannonballs.
    fleet.shots = SHOTS.map((shot, id) => {
      const ship = fleet.ships[shot.ship]!;
      return {
        id,
        shipId: ship.id,
        kind: ship.kind,
        fromX: (ship.x + 1) * 256,
        fromY: (ship.y + 1) * 256,
        toX: shot.toX,
        toY: shot.toY,
        launchTick: -Math.round(shot.at * FLIGHT),
        impactTick: Math.round((1 - shot.at) * FLIGHT),
      };
    });
  }
  applyEnclosure(state);
  return state;
}

async function renderBoard(style: ArtStyle, tile: number): Promise<string> {
  const canvas = document.createElement('canvas');
  const scene = new Scene();
  const look = { theme: await createTheme(style, SEED), art: styleArt(defaultArtConfig, style) };
  await scene.init(canvas, { build: look, combat: look }, defaultArtConfig);
  try {
    const state = previewState();
    const enclosure = computeEnclosure(state);
    scene.resize(state, WIDTH * tile, HEIGHT * tile);
    scene.showLooks({ from: 'combat', to: 'combat', lineY: null });
    scene.drawTerrain(state);
    scene.drawTerritory(state, { build: enclosure.territory, combat: enclosure.territory });
    scene.drawStructures(state);
    const sealed = { build: enclosure.castleEnclosed, combat: enclosure.castleEnclosed };
    // Grunts land fading in; frames enough for them to stand there whole.
    for (let k = 0; k < 8; k++) {
      scene.drawEffects(state, 0, 250, sealed);
      scene.render();
    }
    return scene.app.canvas.toDataURL('image/png');
  } finally {
    scene.app.destroy({ removeView: true });
  }
}

/** The enlarged models' tile size and each cell, in pixels. */
const MODEL_TILE = 64;
const MODEL_CELL = 150;
let modelApp: Application | null = null;

/** The models shown: each kind whole, then hit, then the grunt's two poses. */
const MODELS: readonly ({ kind: ShipKind; hits: number } | { grunt: boolean })[] = [
  { kind: 'raider', hits: 0 },
  { kind: 'transport', hits: 0 },
  { kind: 'frostship', hits: 0 },
  { kind: 'raider', hits: 2 },
  { kind: 'transport', hits: 4 },
  { grunt: false },
  { grunt: true },
];

/** One style's drawings enlarged, a ship on its sea and a grunt on its grass, bow and face up. */
async function renderModels(style: ArtStyle): Promise<{ url: string; own: boolean }> {
  const theme = await createTheme(style, SEED);
  const look = theme.fleet;
  theme.destroy();
  const art = styleArt(defaultArtConfig, style);
  if (modelApp === null) {
    modelApp = new Application();
    await modelApp.init({ width: 8, height: 8, antialias: true, preserveDrawingBuffer: true });
  }
  const app = modelApp;
  app.renderer.resize(MODELS.length * MODEL_CELL, MODEL_CELL);
  const stage = new Container();
  MODELS.forEach((model, i) => {
    const cell = new Graphics();
    const ground = 'grunt' in model ? art.palette.grassMid : art.palette.waterMid;
    cell.rect(i * MODEL_CELL + 1, 1, MODEL_CELL - 2, MODEL_CELL - 2);
    cell.fill({ color: hex(ground) });
    stage.addChild(cell);
    const g = new Graphics();
    if (look === undefined) {
      // The plain drawing every style without its own shares: hits leave it unmarked.
      if ('grunt' in model) drawGrunt(g, MODEL_TILE * 2, art, 0, model.grunt);
      else drawShip(g, MODEL_TILE, art, model.kind);
    } else if ('grunt' in model) {
      look.grunt(g, MODEL_TILE * 2, art, model.grunt);
    } else {
      look.ship(g, MODEL_TILE, art, model.kind, model.hits, false);
    }
    if (look?.tint !== undefined) g.tint = look.tint;
    g.position.set(i * MODEL_CELL + MODEL_CELL / 2, MODEL_CELL / 2);
    stage.addChild(g);
  });
  app.renderer.render(stage);
  const url = (app.renderer.canvas as HTMLCanvasElement).toDataURL('image/png');
  stage.destroy({ children: true });
  return { url, own: look !== undefined };
}

export async function showFleetPreview(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const tile = Number(params.get('tile') ?? 40);
  const only = (params.get('only') ?? '').split(',').filter(isStyle);
  const styles = only.length > 0 ? only : STYLE_IDS;

  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#1a1a24;overflow:auto';
  const page = document.createElement('div');
  page.style.cssText = 'padding:12px;font:13px sans-serif;color:#e8e4d8';
  document.body.append(page);
  const heading = document.createElement('div');
  heading.innerHTML =
    "<b>The campaign's enemy, by style</b> — raider, transport and frost ship; a raider hit " +
    'twice and a transport four times; a grunt standing and smashing (twice the size), bow and ' +
    'face up. Then on a board of the style: a raider heading east, a transport south-east (hit ' +
    "once), a frost ship south (twice), grunts facing each way, and two of the fleet's shots in " +
    "flight, as the style's own cannonballs.";
  page.append(heading);

  const sheet = document.createElement('div');
  sheet.style.cssText = 'margin-top:14px;display:flex;flex-direction:column;gap:14px';
  page.append(sheet);
  for (const style of styles) {
    const card = document.createElement('div');
    card.className = 'fleet-card';
    card.style.cssText = 'display:flex;gap:12px;align-items:center';
    const label = document.createElement('div');
    label.style.cssText = 'width:90px;font-weight:bold';
    const models = await renderModels(style);
    label.innerHTML = models.own ? style : `${style}<br><i style="font-weight:normal">shared</i>`;
    const modelsImg = document.createElement('img');
    modelsImg.src = models.url;
    modelsImg.style.cssText = 'display:block';
    const boardImg = document.createElement('img');
    boardImg.src = await renderBoard(style, tile);
    boardImg.style.cssText = `display:block;width:${WIDTH * tile}px`;
    card.append(label, modelsImg, boardImg);
    sheet.append(card);
  }
  page.dataset['done'] = '1';
}
