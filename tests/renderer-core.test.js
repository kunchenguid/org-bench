const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeCanvasSize,
  resolveAssetUrl,
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
