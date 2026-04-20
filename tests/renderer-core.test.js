const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeCanvasSize,
  computeBoardLayout,
  layoutBoardCards,
  layoutHandCards,
  resolveAssetUrl,
  sampleTurnBanner,
} = require('../src/renderer-core.js');

test('computeCanvasSize scales backing canvas by device pixel ratio', () => {
  const size = computeCanvasSize(960, 540, 2);

  assert.deepEqual(size, {
    cssWidth: 960,
    cssHeight: 540,
    pixelWidth: 1920,
    pixelHeight: 1080,
  });
});

test('resolveAssetUrl keeps asset paths relative to the current document', () => {
  const url = resolveAssetUrl('assets/board-background.svg', 'file:///tmp/run/game/index.html');

  assert.equal(url, 'file:///tmp/run/game/assets/board-background.svg');
});

test('computeBoardLayout creates mirrored lanes, hero panels, and hand slots', () => {
  const layout = computeBoardLayout(1280, 720);

  assert.equal(layout.playerHand.length, 4);
  assert.equal(layout.playerLanes.length, 3);
  assert.equal(layout.enemyLanes.length, 3);
  assert.equal(layout.turnBadge.width, 220);
  assert.equal(layout.turnBadge.height, 56);
  assert.ok(layout.enemyHero.y < layout.playerHero.y);
  assert.ok(layout.enemyLanes[0].y < layout.playerLanes[0].y);
  assert.ok(layout.playerHand[0].y > layout.playerLanes[0].y);
  assert.equal(layout.playerLanes[0].width, layout.playerLanes[1].width);
});

test('layoutHandCards fans cards and keeps the center card closest to the board', () => {
  const hand = layoutHandCards([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 1280, 720, 1000, 'player');

  assert.equal(hand.length, 3);
  assert.ok(hand[0].x < hand[1].x);
  assert.ok(hand[2].x > hand[1].x);
  assert.ok(hand[0].rotation < 0);
  assert.ok(hand[2].rotation > 0);
  assert.ok(hand[1].y < hand[0].y);
  assert.ok(hand[1].y < hand[2].y);
});

test('layoutBoardCards anchors units to lanes and adds idle floating', () => {
  const early = layoutBoardCards([{ id: 'a' }, { id: 'b' }], 1280, 720, 0, 'enemy');
  const late = layoutBoardCards([{ id: 'a' }, { id: 'b' }], 1280, 720, 800, 'enemy');

  assert.equal(early.length, 2);
  assert.ok(early[0].x < early[1].x);
  assert.ok(early[0].y > 0);
  assert.notEqual(early[0].y, late[0].y);
});

test('sampleTurnBanner sweeps on screen and fades away', () => {
  const start = sampleTurnBanner(0, 1280, 720, 'enemy');
  const middle = sampleTurnBanner(500, 1280, 720, 'enemy');
  const end = sampleTurnBanner(1300, 1280, 720, 'enemy');

  assert.ok(start.x < 0);
  assert.ok(Math.abs(middle.x - 640) < 60);
  assert.equal(middle.label, 'Enemy Turn');
  assert.equal(end.opacity, 0);
});
