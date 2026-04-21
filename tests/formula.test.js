const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSheet,
  deleteColumn,
  deleteRow,
  evaluateCell,
  insertColumn,
  insertRow,
  moveFormula,
  pasteMatrix,
} = require('../src/formula.js');

test('evaluates arithmetic expressions with referenced cells', () => {
  const sheet = createSheet({
    A1: '2',
    A2: '3',
    B1: '=A1+A2*4',
  });

  assert.equal(evaluateCell(sheet, 'B1').display, '14');
});

test('supports functions and ranges', () => {
  const sheet = createSheet({
    A1: '2',
    A2: '5',
    A3: '9',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
  });

  assert.equal(evaluateCell(sheet, 'B1').display, '16');
  assert.equal(evaluateCell(sheet, 'B2').display, '5.333333333333333');
});

test('returns spreadsheet style errors for divide by zero and circular references', () => {
  const sheet = createSheet({
    A1: '=1/0',
    B1: '=C1',
    C1: '=B1',
  });

  assert.equal(evaluateCell(sheet, 'A1').display, '#DIV/0!');
  assert.equal(evaluateCell(sheet, 'B1').display, '#CIRC!');
});

test('shifts only relative parts of references when formulas move', () => {
  assert.equal(moveFormula('=A1+$B$2+C$3+$D4', 2, 1), '=B3+$B$2+D$3+$D6');
});

test('inserting a row moves formulas with their data and rewrites affected references', () => {
  const sheet = createSheet({
    A1: '10',
    A2: '20',
    B1: '=SUM(A1:A2)',
  });

  const next = insertRow(sheet, 1);

  assert.equal(next.cells.A2, '10');
  assert.equal(next.cells.A3, '20');
  assert.equal(next.cells.B2, '=SUM(A2:A3)');
  assert.equal(evaluateCell(next, 'B2').display, '30');
});

test('deleting a row rewrites references to keep pointing at surviving data', () => {
  const sheet = createSheet({
    A1: '10',
    A2: '20',
    B3: '=A2',
  });

  const next = deleteRow(sheet, 1);

  assert.equal(next.cells.A1, '20');
  assert.equal(next.cells.B2, '=A1');
  assert.equal(evaluateCell(next, 'B2').display, '20');
});

test('deleting a referenced column leaves a #REF! marker in formulas', () => {
  const sheet = createSheet({
    A1: '7',
    B1: '=A1',
  });

  const next = deleteColumn(sheet, 1);

  assert.equal(next.cells.A1, '=#REF!');
  assert.equal(evaluateCell(next, 'A1').display, '#REF!');
});

test('inserting a column shifts formulas to the right and preserves totals', () => {
  const sheet = createSheet({
    A1: '4',
    B1: '6',
    C1: '=SUM(A1:B1)',
  });

  const next = insertColumn(sheet, 2);

  assert.equal(next.cells.A1, '4');
  assert.equal(next.cells.C1, '6');
  assert.equal(next.cells.D1, '=SUM(A1:C1)');
  assert.equal(evaluateCell(next, 'D1').display, '10');
});

test('pasting a copied rectangle shifts relative formulas from the source range', () => {
  const sheet = createSheet({
    A1: '4',
    A2: '6',
    B1: '=SUM(A1:A2)',
  });

  const pasted = pasteMatrix(
    sheet,
    [['4', '=SUM(A1:A2)']],
    { top: 3, left: 3, bottom: 3, right: 3 },
    { row: 3, col: 3 },
    { top: 1, left: 1, bottom: 1, right: 2 },
    false
  );

  assert.equal(pasted.sheet.cells.C3, '4');
  assert.equal(pasted.sheet.cells.D3, '=SUM(C3:C4)');
});

test('pasting a cut rectangle clears the original cells outside the destination overlap', () => {
  const sheet = createSheet({
    A1: '1',
    B1: '=A1',
  });

  const pasted = pasteMatrix(
    sheet,
    [['1', '=A1']],
    { top: 2, left: 2, bottom: 2, right: 2 },
    { row: 2, col: 2 },
    { top: 1, left: 1, bottom: 1, right: 2 },
    true
  );

  assert.equal(pasted.sheet.cells.A1, undefined);
  assert.equal(pasted.sheet.cells.B1, undefined);
  assert.equal(pasted.sheet.cells.B2, '1');
  assert.equal(pasted.sheet.cells.C2, '=B2');
});
