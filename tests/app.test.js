const assert = require('node:assert/strict');

const {
  createSpreadsheetShellModel,
  columnIndexToLabel,
  createInitialShellState,
  getSelectionBounds,
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
  assert.equal(columnIndexToLabel(26), 'AA');
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

test('createSpreadsheetShellModel honors custom row and column counts', () => {
  const model = createSpreadsheetShellModel({ columnCount: 28, rowCount: 3 });

  assert.equal(model.columns.length, 28);
  assert.equal(model.columns[26].label, 'AA');
  assert.equal(model.columns[27].label, 'AB');
  assert.equal(model.rows.length, 3);
  assert.equal(model.rows[2].cells[27].id, 'AB3');
});

test('createInitialShellState exposes clean integration points', () => {
  const state = createInitialShellState();

  assert.deepEqual(state.selection, {
    activeCellId: 'A1',
    anchorCellId: 'A1',
    focusCellId: 'A1',
    range: {
      startCellId: 'A1',
      endCellId: 'A1',
    },
  });
  assert.equal(state.formulaBarValue, '');
  assert.equal(state.mode, 'navigate');
});

test('getSelectionBounds normalizes a rectangular selection range', () => {
  assert.deepEqual(
    getSelectionBounds({
      anchorCellId: 'C4',
      focusCellId: 'A2',
    }),
    {
      startColumnIndex: 0,
      endColumnIndex: 2,
      startRowIndex: 1,
      endRowIndex: 3,
    }
  );
});
