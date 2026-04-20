const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSceneGraph,
  computeViewport,
  normalizePointer,
  resolveAssetUrl,
} = require('../src/render-runtime.js');

test('computeViewport preserves aspect ratio inside the window', () => {
  const viewport = computeViewport({ width: 1600, height: 900 }, { width: 1200, height: 1000 }, 2);

  assert.deepEqual(viewport, {
    cssWidth: 1200,
    cssHeight: 675,
    pixelWidth: 2400,
    pixelHeight: 1350,
    offsetX: 0,
    offsetY: 162.5,
    scale: 0.75,
    dpr: 2,
  });
});

test('scene graph returns nodes sorted by layer then order', () => {
  const graph = createSceneGraph();
  graph.add({ id: 'hud', layer: 40, order: 2 });
  graph.add({ id: 'board', layer: 20, order: 5 });
  graph.add({ id: 'particles', layer: 20, order: 6 });
  graph.add({ id: 'background', layer: 0, order: 0 });

  assert.deepEqual(graph.getDrawList().map((node) => node.id), [
    'background',
    'board',
    'particles',
    'hud',
  ]);
});

test('normalizePointer maps client coordinates into scene coordinates', () => {
  const pointer = normalizePointer(
    { x: 610, y: 387.5 },
    { left: 10, top: 50, width: 1200, height: 675 },
    { width: 1600, height: 900 },
  );

  assert.deepEqual(pointer, { x: 800, y: 450 });
});

test('resolveAssetUrl keeps relative assets file-safe', () => {
  assert.equal(resolveAssetUrl('assets/cards/emberling.svg', 'file:///tmp/game/index.html'), 'file:///tmp/game/assets/cards/emberling.svg');
  assert.equal(resolveAssetUrl('./assets/board/reef.svg', 'https://example.com/play/index.html'), 'https://example.com/play/assets/board/reef.svg');
});
