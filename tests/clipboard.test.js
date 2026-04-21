const test = require('node:test');
const assert = require('node:assert/strict');

const { createSheet } = require('../src/formula.js');
const { applyMatrixToSheet } = require('../src/clipboard.js');

test('pasting formulas into a new single-cell target shifts relative references', () => {
  const sheet = createSheet({
    A1: '2',
    A2: '3',
    B1: '=A1+A2',
  });

  const result = applyMatrixToSheet({
    sheet,
    matrix: [['=A1+A2']],
    targetBounds: { top: 3, left: 2, bottom: 3, right: 2 },
    activePoint: { row: 3, col: 2 },
    sourceBounds: { top: 1, left: 2, bottom: 1, right: 2 },
    pendingCut: null,
    rowCount: 100,
    columnCount: 26,
  });

  assert.equal(result.sheet.cells.B3, '=A3+A4');
});

test('pasting into a matching-size selection writes cell by cell', () => {
  const sheet = createSheet({
    A1: 'old',
    B1: 'old',
    A2: 'old',
    B2: 'old',
  });

  const result = applyMatrixToSheet({
    sheet,
    matrix: [['1', '2'], ['3', '4']],
    targetBounds: { top: 1, left: 1, bottom: 2, right: 2 },
    activePoint: { row: 2, col: 2 },
    sourceBounds: null,
    pendingCut: null,
    rowCount: 100,
    columnCount: 26,
  });

  assert.deepEqual(result.sheet.cells, {
    A1: '1',
    B1: '2',
    A2: '3',
    B2: '4',
  });
  assert.deepEqual(result.selection, { row: 2, col: 2 });
  assert.deepEqual(result.anchor, { row: 1, col: 1 });
});

test('cut-paste clears the source cells that fall outside the destination', () => {
  const sheet = createSheet({
    A1: '1',
    B1: '2',
    C1: 'keep',
  });

  const pendingCut = {
    sourceBounds: { top: 1, left: 1, bottom: 1, right: 2 },
  };

  const result = applyMatrixToSheet({
    sheet,
    matrix: [['1', '2']],
    targetBounds: { top: 1, left: 2, bottom: 1, right: 2 },
    activePoint: { row: 1, col: 2 },
    sourceBounds: { top: 1, left: 1, bottom: 1, right: 2 },
    pendingCut,
    rowCount: 100,
    columnCount: 26,
  });

  assert.deepEqual(result.sheet.cells, {
    B1: '1',
    C1: '2',
  });
  assert.equal(result.pendingCut, null);
});
