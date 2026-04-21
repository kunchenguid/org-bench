const test = require('node:test');
const assert = require('node:assert/strict');

const { createSelection, isInRange } = require('../selection.js');

test('normalizes a rectangular selection regardless of drag direction', () => {
  const selection = createSelection('C4', 'A2');

  assert.deepEqual(selection, {
    startCol: 0,
    endCol: 2,
    startRow: 1,
    endRow: 3,
  });
});

test('detects whether a cell is inside the active range', () => {
  const selection = createSelection('B2', 'D4');

  assert.equal(isInRange(selection, 'C3'), true);
  assert.equal(isInRange(selection, 'A1'), false);
});
