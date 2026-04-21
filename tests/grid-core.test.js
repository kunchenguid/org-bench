const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COLS,
  ROWS,
  buildInitialState,
  clampCell,
  normalizeRange,
  moveActive,
  selectionFromAnchor,
} = require('../grid-core.js');

test('buildInitialState starts at A1 with no range and shell dimensions', () => {
  const state = buildInitialState();

  assert.equal(COLS, 26);
  assert.equal(ROWS, 100);
  assert.deepEqual(state.active, { col: 0, row: 0 });
  assert.equal(state.anchor, null);
  assert.equal(state.editing, false);
});

test('clampCell keeps navigation inside the grid bounds', () => {
  assert.deepEqual(clampCell({ col: -1, row: -10 }), { col: 0, row: 0 });
  assert.deepEqual(clampCell({ col: 40, row: 150 }), { col: 25, row: 99 });
});

test('normalizeRange sorts corners and preserves active cell', () => {
  assert.deepEqual(
    normalizeRange({ start: { col: 5, row: 8 }, end: { col: 2, row: 3 }, active: { col: 5, row: 8 } }),
    {
      start: { col: 2, row: 3 },
      end: { col: 5, row: 8 },
      active: { col: 5, row: 8 },
    }
  );
});

test('moveActive clamps arrow-key movement at the sheet edges', () => {
  const from = { col: 0, row: 0 };
  assert.deepEqual(moveActive(from, 'ArrowLeft'), { col: 0, row: 0 });
  assert.deepEqual(moveActive(from, 'ArrowUp'), { col: 0, row: 0 });
  assert.deepEqual(moveActive(from, 'ArrowRight'), { col: 1, row: 0 });
  assert.deepEqual(moveActive(from, 'ArrowDown'), { col: 0, row: 1 });
});

test('selectionFromAnchor expands the rectangular range from anchor to active cell', () => {
  assert.deepEqual(
    selectionFromAnchor({ col: 1, row: 2 }, { col: 4, row: 6 }),
    {
      start: { col: 1, row: 2 },
      end: { col: 4, row: 6 },
      active: { col: 4, row: 6 },
    }
  );
});
