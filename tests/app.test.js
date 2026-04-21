const assert = require('node:assert/strict');

const {
  createSpreadsheetShellModel,
  columnIndexToLabel,
  createInitialShellState,
} = require('../app.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('columnIndexToLabel returns spreadsheet labels', () => {
  assert.equal(columnIndexToLabel(0), 'A');
  assert.equal(columnIndexToLabel(25), 'Z');
});

test('createSpreadsheetShellModel builds a 26 by 100 grid', () => {
  const model = createSpreadsheetShellModel();

  assert.equal(model.columns.length, 26);
  assert.equal(model.rows.length, 100);
  assert.equal(model.columns[0].label, 'A');
  assert.equal(model.columns[25].label, 'Z');
  assert.equal(model.rows[0].index, 1);
  assert.equal(model.rows[99].index, 100);
  assert.equal(model.rows[0].cells[0].id, 'A1');
  assert.equal(model.rows[99].cells[25].id, 'Z100');
});

test('createInitialShellState exposes clean integration points', () => {
  const state = createInitialShellState();

  assert.deepEqual(state.selection, {
    activeCellId: 'A1',
    anchorCellId: 'A1',
    focusCellId: 'A1',
  });
  assert.equal(state.formulaBarValue, '');
  assert.equal(state.mode, 'navigate');
});
