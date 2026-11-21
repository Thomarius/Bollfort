import { defaultArtConfig, defaultRuleset, type ArtStyle } from '@bollfort/config';
import {
  applyEnclosure,
  computeEnclosure,
  drainEvents,
  fire,
  stateFromAscii,
  withSpecials,
  type MatchState,
} from '@bollfort/sim';

import { createTheme, Scene } from './render/scene.js';
import { STYLE_IDS, isStyle, styleArt } from './styles/registry.js';

/**
 * Every style's Fortified Tower (`?fortified=preview`, a developer's page, 2026-11-21): a 2x2 and
 * a 3x3 set into a ring, drawn by each style as its wall with small guns on top
 * (`render/fortified.ts`). Beside each still in the build phase, one in combat, the 3x3's two guns
 * having fired apart at a rival's wall, their shots in the air. Through a real `Scene`, as the
 * drones' page is.
 */
const BOARD = `
  ....................
  .,,,,,,,,,,,..,,,,,.
  .,######KKK,..,###,.
  .,#,,,,,KKK,..,#,#,.
  .,#,,@@,KKK,..,###,.
  .,#,,@@,,,#,..,,,,,.
  .,#,,,,,,,#,..,,,,,.
  .,##kk#####,..,,,,,.
  .,,,kk,,,,,,..,,,,,.
  ....................
`;
const ISLANDS = `
  ....................
  .11111111111..22222.
  .11111111111..22222.
  .11111111111..22222.
  .11111111111..22222.
  .11111111111..22222.
  .11111111111..22222.
  .11111111111..22222.
  .11111111111..22222.
  ....................
`;
const WIDTH = 20;
const HEIGHT = 10;
const SEED = 5;

function previewState(phase: 'build' | 'combat'): MatchState {
  const state = stateFromAscii(BOARD, withSpecials(defaultRuleset), ISLANDS);
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

async function still(style: ArtStyle, tile: number, phase: 'build' | 'combat'): Promise<string> {
  const canvas = document.createElement('canvas');
  const scene = new Scene();
  const look = { theme: await createTheme(style, SEED), art: styleArt(defaultArtConfig, style) };
  await scene.init(canvas, { build: look, combat: look }, defaultArtConfig);
  try {
    const state = previewState(phase);
    const enclosure = computeEnclosure(state);
    scene.resize(state, WIDTH * tile, HEIGHT * tile);
    scene.showLooks({ from: phase, to: phase, lineY: null });
    scene.drawTerrain(state);
    scene.drawTerritory(state, { build: enclosure.territory, combat: enclosure.territory });
    scene.drawStructures(state);
    const sealed = { build: enclosure.castleEnclosed, combat: enclosure.castleEnclosed };
    for (let k = 0; k < 6; k++) scene.drawEffects(state, 0, 250, sealed);
    if (phase === 'combat') {
      // Both of the 3x3's barrels, one after the other, at the rival's walls; the 2x2 too.
      for (const [x, y] of [
        [15, 2],
        [17, 4],
        [16, 2],
      ] as const) {
        fire(state, 0, x, y);
      }
      for (const event of drainEvents(state)) {
        if (event.kind === 'shot_fired') scene.noteShot(event.shot, state);
      }
      state.tick += 4;
    }
    for (let k = 0; k < 3; k++) scene.drawEffects(state, 0, 40, sealed);
    scene.render();
    return scene.app.canvas.toDataURL('image/png');
  } finally {
    scene.app.destroy({ removeView: true });
  }
}

export async function showFortifiedPreview(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const tile = Number(params.get('tile') ?? 32);
  const only = (params.get('only') ?? '').split(',').filter(isStyle);
  const styles = only.length > 0 ? only : STYLE_IDS;

  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#1a1a24;overflow:auto';
  const page = document.createElement('div');
  page.style.cssText = 'padding:12px;font:13px sans-serif;color:#e8e4d8';
  page.innerHTML =
    '<b>Fortified Towers</b> — a 2x2 and a 3x3 in each style, in the build phase and in ' +
    "combat, the 3x3's two guns having fired apart.";
  document.body.append(page);
  const sheet = document.createElement('div');
  sheet.style.cssText = 'margin-top:12px;display:flex;flex-direction:column;gap:8px';
  page.append(sheet);
  for (const style of styles) {
    const card = document.createElement('div');
    card.style.cssText = 'display:flex;gap:8px;align-items:center';
    const label = document.createElement('div');
    label.textContent = style;
    label.style.cssText = 'width:90px;font-weight:bold';
    card.append(label);
    for (const phase of ['build', 'combat'] as const) {
      const img = document.createElement('img');
      img.src = await still(style, tile, phase);
      img.style.cssText = `display:block;width:${WIDTH * tile}px`;
      card.append(img);
    }
    sheet.append(card);
  }
  page.dataset['done'] = '1';
}
