const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheetModel } = require('../src/model.js');

test('moveSelection clamps to the grid bounds', () => {
  const model = createSpreadsheetModel({ rows: 3, cols: 3 });

  model.moveSelection(-1, -1);
  assert.deepEqual(model.getSelectedCell(), { row: 0, col: 0 });

  model.moveSelection(10, 10);
  assert.deepEqual(model.getSelectedCell(), { row: 2, col: 2 });
});

test('setCell stores raw values and serialize restores them', () => {
  const model = createSpreadsheetModel({ rows: 4, cols: 4 });

  model.setCell(1, 2, '=A1+1');
  model.selectCell(1, 2);

  const snapshot = model.serialize();
  const restored = createSpreadsheetModel({ rows: 4, cols: 4, snapshot });

  assert.equal(restored.getCellRaw(1, 2), '=A1+1');
  assert.deepEqual(restored.getSelectedCell(), { row: 1, col: 2 });
});

test('clearRange removes all cells inside the rectangular selection', () => {
  const model = createSpreadsheetModel({ rows: 4, cols: 4 });

  model.setCell(0, 0, '1');
  model.setCell(0, 1, '2');
  model.setCell(1, 0, '3');
  model.setCell(1, 1, '4');

  model.clearRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });

  assert.equal(model.getCellRaw(0, 0), '');
  assert.equal(model.getCellRaw(0, 1), '');
  assert.equal(model.getCellRaw(1, 0), '');
  assert.equal(model.getCellRaw(1, 1), '');
});
