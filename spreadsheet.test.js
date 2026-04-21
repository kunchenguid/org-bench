const test = require('node:test');
const assert = require('node:assert/strict');

const {
  copyRange,
  createStore,
  evaluateCell,
  evaluateSheet,
  pasteRange,
  parseCellRef,
  shiftFormula,
} = require('./spreadsheet-core.js');

test('parses A1 style references', () => {
  assert.deepEqual(parseCellRef('B12'), { col: 1, row: 11 });
});

test('evaluates plain values', () => {
  const store = createStore();
  store.setCell(0, 0, '42');
  store.setCell(1, 0, 'hello');

  const sheet = evaluateSheet(store);

  assert.equal(sheet.getDisplay(0, 0), '42');
  assert.equal(sheet.getDisplay(1, 0), 'hello');
});

test('evaluates formulas with cell references', () => {
  const store = createStore();
  store.setCell(0, 0, '2');
  store.setCell(0, 1, '3');
  store.setCell(0, 2, '=A1+A2');

  const sheet = evaluateSheet(store);

  assert.equal(sheet.getDisplay(0, 2), '5');
});

test('evaluates SUM over ranges', () => {
  const store = createStore();
  store.setCell(0, 0, '2');
  store.setCell(0, 1, '3');
  store.setCell(0, 2, '5');
  store.setCell(1, 0, '=SUM(A1:A3)');

  const sheet = evaluateSheet(store);

  assert.equal(sheet.getDisplay(1, 0), '10');
});

test('detects circular references', () => {
  const store = createStore();
  store.setCell(0, 0, '=B1');
  store.setCell(1, 0, '=A1');

  const sheet = evaluateSheet(store);

  assert.equal(sheet.getDisplay(0, 0), '#CIRC!');
  assert.equal(sheet.getDisplay(1, 0), '#CIRC!');
});

test('shifts relative references during paste', () => {
  assert.equal(shiftFormula('=A1+$B2+C$3+$D$4', 1, 2), '=B3+$B4+D$3+$D$4');
});

test('reports formula errors', () => {
  const store = createStore();
  store.setCell(0, 0, '=1/0');

  const result = evaluateCell(store, 0, 0, new Map(), new Set());

  assert.equal(result.display, '#DIV/0!');
});

test('copies rectangular ranges as raw cell blocks', () => {
  const store = createStore();
  store.setCell(0, 0, '1');
  store.setCell(1, 0, '=A1');
  store.setCell(0, 1, 'x');

  assert.deepEqual(copyRange(store, {
    startCol: 0,
    startRow: 0,
    endCol: 1,
    endRow: 1,
  }), {
    startCol: 0,
    startRow: 0,
    width: 2,
    height: 2,
    cells: [
      ['1', '=A1'],
      ['x', ''],
    ],
  });
});

test('pastes copied ranges and shifts relative formulas', () => {
  const store = createStore();
  store.setCell(0, 0, '7');
  store.setCell(1, 0, '=A1');

  pasteRange(store, { startCol: 0, startRow: 0, width: 2, height: 1, cells: [['7', '=A1']] }, {
    startCol: 2,
    startRow: 1,
    endCol: 2,
    endRow: 1,
  });

  assert.equal(store.getCell(2, 1), '7');
  assert.equal(store.getCell(3, 1), '=C2');
});

test('pasting into a matching selection fills cell by cell', () => {
  const store = createStore();

  pasteRange(store, { startCol: 0, startRow: 0, width: 2, height: 2, cells: [['1', '2'], ['3', '=A1']] }, {
    startCol: 3,
    startRow: 3,
    endCol: 4,
    endRow: 4,
  });

  assert.equal(store.getCell(3, 3), '1');
  assert.equal(store.getCell(4, 3), '2');
  assert.equal(store.getCell(3, 4), '3');
  assert.equal(store.getCell(4, 4), '=D4');
});
