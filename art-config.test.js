const test = require('node:test');
const assert = require('node:assert/strict');

const { createArtCatalog } = require('./art-config.js');

test('art catalog exposes relative board, hero, and hud asset paths', () => {
  const art = createArtCatalog();

  assert.equal(art.board.path, 'assets/art/board/astral-duel-board.svg');
  assert.equal(art.heroes.player, 'assets/art/heroes/solar-warden-placeholder.svg');
  assert.equal(art.heroes.enemy, 'assets/art/heroes/umbral-oracle-placeholder.svg');
  assert.equal(art.hud.health, 'assets/art/icons/health-glyph.svg');
  assert.equal(art.hud.mana, 'assets/art/icons/mana-crystal.svg');
});

test('art catalog keeps file-safe relative paths and faction accents', () => {
  const art = createArtCatalog();

  assert.match(art.board.path, /^(?!\/|https?:)/);
  assert.match(art.heroes.player, /^(?!\/|https?:)/);
  assert.match(art.heroes.enemy, /^(?!\/|https?:)/);
  assert.deepEqual(art.accents.player, ['#f8d36a', '#ff9f43', '#5b2d0f', '#fff4cf']);
  assert.deepEqual(art.accents.enemy, ['#69e6ff', '#5777ff', '#21163d', '#cbe9ff']);
});
