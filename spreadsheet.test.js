const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clipboardFromText,
  clipboardToText,
  copyRange,
  createEditBuffer,
  createStore,
  deleteColumn,
  deleteRow,
  evaluateCell,
  evaluateSheet,
  createHistorySnapshot,
  insertColumn,
  insertRow,
  pasteRange,
  parseCellRef,
  resolveEditBuffer,
  restoreHistorySnapshot,
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

test('serializes clipboard cells as TSV text', () => {
  assert.equal(clipboardToText({
    cells: [
      ['1', '2'],
      ['3', '=A1'],
    ],
  }), '1\t2\n3\t=A1');
});

test('parses TSV text into clipboard cell blocks', () => {
  assert.deepEqual(clipboardFromText('1\t2\n3\t=A1'), {
    startCol: 0,
    startRow: 0,
    width: 2,
    height: 2,
    cells: [
      ['1', '2'],
      ['3', '=A1'],
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

test('supports comparison operators in formulas', () => {
  const store = createStore();
  store.setCell(0, 0, '4');
  store.setCell(0, 1, '4');
  store.setCell(0, 2, '=A1=A2');
  store.setCell(1, 2, '=A1<>3');
  store.setCell(2, 2, '=A1>=A2');

  const sheet = evaluateSheet(store);

  assert.equal(sheet.getDisplay(0, 2), 'TRUE');
  assert.equal(sheet.getDisplay(1, 2), 'TRUE');
  assert.equal(sheet.getDisplay(2, 2), 'TRUE');
});

test('supports string concatenation and CONCAT', () => {
  const store = createStore();
  store.setCell(0, 0, '2');
  store.setCell(0, 1, '3');
  store.setCell(0, 2, '="Total: "&SUM(A1:A2)');
  store.setCell(1, 2, '=CONCAT("A", "-", "B")');

  const sheet = evaluateSheet(store);

  assert.equal(sheet.getDisplay(0, 2), 'Total: 5');
  assert.equal(sheet.getDisplay(1, 2), 'A-B');
});

test('supports IF and boolean helper functions', () => {
  const store = createStore();
  store.setCell(0, 0, '=IF(AND(TRUE, NOT(FALSE)), "ok", "bad")');
  store.setCell(1, 0, '=OR(FALSE, TRUE)');

  const sheet = evaluateSheet(store);

  assert.equal(sheet.getDisplay(0, 0), 'ok');
  assert.equal(sheet.getDisplay(1, 0), 'TRUE');
});

test('treats empty references as zero in numeric formulas', () => {
  const store = createStore();
  store.setCell(0, 0, '=B1+2');

  const sheet = evaluateSheet(store);

  assert.equal(sheet.getDisplay(0, 0), '2');
});

test('inserting a row keeps formulas pointing at the same data', () => {
  const store = createStore();
  store.setCell(0, 0, '10');
  store.setCell(0, 1, '20');
  store.setCell(1, 0, '=A2');

  insertRow(store, 1);

  assert.equal(store.getCell(0, 0), '10');
  assert.equal(store.getCell(0, 2), '20');
  assert.equal(store.getCell(1, 0), '=A3');
});

test('deleting a referenced row produces #REF!', () => {
  const store = createStore();
  store.setCell(0, 0, '10');
  store.setCell(0, 1, '20');
  store.setCell(1, 0, '=A2');

  deleteRow(store, 1);

  assert.equal(store.getCell(1, 0), '=#REF!');
  assert.equal(evaluateSheet(store).getDisplay(1, 0), '#REF!');
});

test('inserting a column keeps formulas pointing at the same data', () => {
  const store = createStore();
  store.setCell(0, 0, '10');
  store.setCell(1, 0, '20');
  store.setCell(0, 1, '=B1');

  insertColumn(store, 1);

  assert.equal(store.getCell(0, 0), '10');
  assert.equal(store.getCell(2, 0), '20');
  assert.equal(store.getCell(0, 1), '=C1');
});

test('deleting a referenced column produces #REF!', () => {
  const store = createStore();
  store.setCell(0, 0, '10');
  store.setCell(1, 0, '20');
  store.setCell(0, 1, '=B1');

  deleteColumn(store, 1);

  assert.equal(store.getCell(0, 1), '=#REF!');
  assert.equal(evaluateSheet(store).getDisplay(0, 1), '#REF!');
});

test('history snapshots preserve selection metadata alongside structural cell changes', () => {
  const store = createStore();
  store.setCell(0, 0, '10');
  store.setCell(0, 2, '20');

  const snapshot = createHistorySnapshot(store, { col: 0, row: 3 }, { col: 0, row: 3 });
  const restored = restoreHistorySnapshot(snapshot);

  assert.equal(restored.store.getCell(0, 0), '10');
  assert.equal(restored.store.getCell(0, 2), '20');
  assert.deepEqual(restored.selection, { col: 0, row: 3 });
  assert.deepEqual(restored.rangeAnchor, { col: 0, row: 3 });
});

test('committing an edit buffer uses the draft value', () => {
  const buffer = createEditBuffer('=A1');
  buffer.draft = '=A1+1';

  assert.equal(resolveEditBuffer(buffer, true), '=A1+1');
});

test('cancelling an edit buffer restores the original value', () => {
  const buffer = createEditBuffer('=A1');
  buffer.draft = '=A1+1';

  assert.equal(resolveEditBuffer(buffer, false), '=A1');
});
