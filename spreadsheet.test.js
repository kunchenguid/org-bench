const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetState,
  commitCell,
  moveSelection,
  serializeState,
  deserializeState,
  applyCellEdit,
  undo,
  redo,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
} = require('./spreadsheet-core.js');

test('starts with A1 selected and an empty sheet', () => {
  const state = createSpreadsheetState();

  assert.deepEqual(state.selection, { row: 0, col: 0 });
  assert.equal(state.cells.size, 0);
});

test('committing cell content stores raw text and display value', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '42');
  const cell = state.cells.get('A1');

  assert.deepEqual(cell, {
    raw: '42',
    value: 42,
    display: '42',
    kind: 'number',
  });
});

test('moving selection clamps to sheet bounds', () => {
  const state = createSpreadsheetState();

  moveSelection(state, -1, -1);
  assert.deepEqual(state.selection, { row: 0, col: 0 });

  moveSelection(state, 150, 30);
  assert.deepEqual(state.selection, { row: 99, col: 25 });
});

test('serializes and restores only namespaced spreadsheet state', () => {
  const state = createSpreadsheetState();
  state.selection = { row: 3, col: 4 };
  commitCell(state, 3, 4, 'hello');

  const entries = serializeState(state, 'bench:');

  assert.deepEqual(entries, {
    'bench:spreadsheet': JSON.stringify({
      selection: { row: 3, col: 4 },
      cells: {
        E4: 'hello',
      },
    }),
  });

  const restored = deserializeState(entries, 'bench:');
  assert.deepEqual(restored.selection, { row: 3, col: 4 });
  assert.deepEqual(restored.cells.get('E4'), {
    raw: 'hello',
    value: 'hello',
    display: 'hello',
    kind: 'text',
  });
});

test('undo reverts the latest cell edit and redo reapplies it', () => {
  const state = createSpreadsheetState();

  applyCellEdit(state, 0, 0, '12');
  applyCellEdit(state, 0, 0, '34');

  assert.equal(state.cells.get('A1').raw, '34');

  undo(state);
  assert.equal(state.cells.get('A1').raw, '12');

  redo(state);
  assert.equal(state.cells.get('A1').raw, '34');
});

test('undo restores a cleared cell and keeps history bounded', () => {
  const state = createSpreadsheetState();

  applyCellEdit(state, 1, 1, 'kept');
  applyCellEdit(state, 1, 1, '');

  assert.equal(state.cells.has('B2'), false);

  undo(state);
  assert.equal(state.cells.get('B2').raw, 'kept');

  for (let index = 0; index < 60; index += 1) {
    applyCellEdit(state, 0, 0, String(index));
  }

  assert.equal(state.history.past.length, 50);
});

test('evaluates arithmetic formulas with cell references and recomputes dependents', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '2');
  commitCell(state, 1, 0, '4');
  commitCell(state, 2, 0, '=A1+A2*2');

  assert.deepEqual(state.cells.get('A3'), {
    raw: '=A1+A2*2',
    value: 10,
    display: '10',
    kind: 'formula',
  });

  commitCell(state, 1, 0, '5');

  assert.equal(state.cells.get('A3').display, '12');
});

test('evaluates SUM over ranges and string concatenation', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '3');
  commitCell(state, 1, 0, '4');
  commitCell(state, 2, 0, '="Total: "&SUM(A1:A2)');

  assert.deepEqual(state.cells.get('A3'), {
    raw: '="Total: "&SUM(A1:A2)',
    value: 'Total: 7',
    display: 'Total: 7',
    kind: 'formula',
  });
});

test('supports boolean comparisons in formulas', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '5');
  commitCell(state, 0, 1, '=A1>=3');

  assert.deepEqual(state.cells.get('B1'), {
    raw: '=A1>=3',
    value: true,
    display: 'TRUE',
    kind: 'formula',
  });
});

test('reports divide by zero errors clearly', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '=1/0');

  assert.deepEqual(state.cells.get('A1'), {
    raw: '=1/0',
    value: '#DIV/0!',
    display: '#DIV/0!',
    kind: 'error',
  });
});

test('detects circular references', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '=B1');
  commitCell(state, 0, 1, '=A1');

  assert.equal(state.cells.get('A1').display, '#CIRC!');
  assert.equal(state.cells.get('B1').display, '#CIRC!');
});

test('inserting a row shifts referenced rows to keep pointing at the same data', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '2');
  commitCell(state, 1, 0, '4');
  commitCell(state, 0, 1, '=A1+A2');

  insertRow(state, 1);

  assert.equal(state.cells.get('A1').display, '2');
  assert.equal(state.cells.get('A3').display, '4');
  assert.deepEqual(state.cells.get('B1'), {
    raw: '=A1+A3',
    value: 6,
    display: '6',
    kind: 'formula',
  });
});

test('deleting a referenced row turns that reference into #REF!', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '2');
  commitCell(state, 1, 0, '4');
  commitCell(state, 2, 1, '=A1+A2');

  deleteRow(state, 0);

  assert.equal(state.cells.get('A1').display, '4');
  assert.deepEqual(state.cells.get('B2'), {
    raw: '=#REF!+A1',
    value: '#REF!',
    display: '#REF!',
    kind: 'error',
  });
});

test('inserting a column shifts referenced columns to keep pointing at the same data', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '2');
  commitCell(state, 0, 1, '4');
  commitCell(state, 1, 0, '=A1+B1');

  insertColumn(state, 1);

  assert.equal(state.cells.get('A1').display, '2');
  assert.equal(state.cells.get('C1').display, '4');
  assert.deepEqual(state.cells.get('A2'), {
    raw: '=A1+C1',
    value: 6,
    display: '6',
    kind: 'formula',
  });
});

test('deleting a referenced column turns that reference into #REF!', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '2');
  commitCell(state, 0, 1, '4');
  commitCell(state, 1, 2, '=A1+B1');

  deleteColumn(state, 0);

  assert.equal(state.cells.get('A1').display, '4');
  assert.deepEqual(state.cells.get('B2'), {
    raw: '=#REF!+A1',
    value: '#REF!',
    display: '#REF!',
    kind: 'error',
  });
});
