const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetState,
  commitCell,
  applyCellEdit,
  undo,
  redo,
  moveSelection,
  serializeState,
  deserializeState,
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

test('evaluates arithmetic formulas with cell references', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '7');
  commitCell(state, 1, 0, '5');
  commitCell(state, 2, 0, '=A1+A2');

  assert.deepEqual(state.cells.get('A3'), {
    raw: '=A1+A2',
    value: 12,
    display: '12',
    kind: 'formula',
  });

  commitCell(state, 1, 0, '10');
  assert.equal(state.cells.get('A3').display, '17');
});

test('evaluates SUM over a vertical range', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '2');
  commitCell(state, 1, 0, '3');
  commitCell(state, 2, 0, '4');
  commitCell(state, 3, 0, '=SUM(A1:A3)');

  assert.deepEqual(state.cells.get('A4'), {
    raw: '=SUM(A1:A3)',
    value: 9,
    display: '9',
    kind: 'formula',
  });
});

test('renders circular references as #CIRC!', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '=B1');
  commitCell(state, 0, 1, '=A1');

  assert.equal(state.cells.get('A1').display, '#CIRC!');
  assert.equal(state.cells.get('B1').display, '#CIRC!');
});

test('renders invalid formulas as #ERR!', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '=SUM(A1)');

  assert.equal(state.cells.get('A1').display, '#ERR!');
});

test('undo and redo restore precedent changes that formulas depend on', () => {
  const state = createSpreadsheetState();

  applyCellEdit(state, 0, 0, '5');
  applyCellEdit(state, 1, 0, '7');
  applyCellEdit(state, 2, 0, '=A1+A2');

  assert.equal(state.cells.get('A3').display, '12');

  applyCellEdit(state, 1, 0, '10');
  assert.equal(state.cells.get('A3').display, '15');

  assert.equal(undo(state), true);
  assert.equal(state.cells.get('A3').display, '12');

  assert.equal(redo(state), true);
  assert.equal(state.cells.get('A3').display, '15');
});

test('renders divide by zero as #DIV/0!', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '=10/0');

  assert.equal(state.cells.get('A1').display, '#DIV/0!');
});

test('evaluates AVERAGE, MIN, MAX, COUNT, ABS, and ROUND', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '2');
  commitCell(state, 1, 0, '4');
  commitCell(state, 2, 0, '8');
  commitCell(state, 0, 1, '=AVERAGE(A1:A3)');
  commitCell(state, 1, 1, '=MIN(A1:A3)');
  commitCell(state, 2, 1, '=MAX(A1:A3)');
  commitCell(state, 3, 1, '=COUNT(A1:A3)');
  commitCell(state, 4, 1, '=ABS(-9)');
  commitCell(state, 5, 1, '=ROUND(3.49)');

  assert.equal(state.cells.get('B1').display, '4.666666666666667');
  assert.equal(state.cells.get('B2').display, '2');
  assert.equal(state.cells.get('B3').display, '8');
  assert.equal(state.cells.get('B4').display, '3');
  assert.equal(state.cells.get('B5').display, '9');
  assert.equal(state.cells.get('B6').display, '3');
});

test('evaluates comparisons and boolean literals', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '9');
  commitCell(state, 1, 0, '3');
  commitCell(state, 0, 1, '=A1>A2');
  commitCell(state, 1, 1, '=A1<=A2');
  commitCell(state, 2, 1, '=TRUE');
  commitCell(state, 3, 1, '=FALSE');

  assert.equal(state.cells.get('B1').display, 'TRUE');
  assert.equal(state.cells.get('B2').display, 'FALSE');
  assert.equal(state.cells.get('B3').display, 'TRUE');
  assert.equal(state.cells.get('B4').display, 'FALSE');
});

test('evaluates IF, AND, OR, and NOT', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '9');
  commitCell(state, 1, 0, '3');
  commitCell(state, 0, 1, '=IF(A1>A2,1,0)');
  commitCell(state, 1, 1, '=AND(TRUE,A1>A2)');
  commitCell(state, 2, 1, '=OR(FALSE,A1<A2)');
  commitCell(state, 3, 1, '=NOT(A1<A2)');

  assert.equal(state.cells.get('B1').display, '1');
  assert.equal(state.cells.get('B2').display, 'TRUE');
  assert.equal(state.cells.get('B3').display, 'FALSE');
  assert.equal(state.cells.get('B4').display, 'TRUE');
});

test('evaluates string literals with ampersand concatenation', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '9');
  commitCell(state, 0, 1, '="Total: "&A1');

  assert.equal(state.cells.get('B1').display, 'Total: 9');
});

test('evaluates CONCAT across literals and references', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '9');
  commitCell(state, 0, 1, '=CONCAT("A",A1,"B")');

  assert.equal(state.cells.get('B1').display, 'A9B');
});
