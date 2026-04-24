const test = require('node:test');
const assert = require('node:assert/strict');
const { SpreadsheetModel, adjustFormulaReferences } = require('../spreadsheet-core.js');

function set(sheet, ref, raw) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  const col = match[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  sheet.setCell(Number(match[2]) - 1, col, raw);
}

function raw(sheet, ref) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  const col = match[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return sheet.getRaw(Number(match[2]) - 1, col);
}

function display(sheet, ref) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  const col = match[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return sheet.getDisplay(Number(match[2]) - 1, col);
}

test('evaluates formulas and recomputes dependents', () => {
  const sheet = new SpreadsheetModel(10, 5);

  set(sheet, 'A1', '2');
  set(sheet, 'A2', '3');
  set(sheet, 'A3', '=SUM(A1:A2)');

  assert.equal(display(sheet, 'A3'), '5');

  set(sheet, 'A1', '7');

  assert.equal(display(sheet, 'A3'), '10');
});

test('empty cells display blank but evaluate as zero in formulas', () => {
  const sheet = new SpreadsheetModel(10, 5);

  set(sheet, 'A1', '=B1+2');

  assert.equal(display(sheet, 'B1'), '');
  assert.equal(display(sheet, 'A1'), '2');
});

test('supports arithmetic precedence, unary minus, comparisons, concatenation, and booleans', () => {
  const sheet = new SpreadsheetModel(10, 8);

  set(sheet, 'A1', '=1+2*3');
  set(sheet, 'A2', '=-(1+2)*3');
  set(sheet, 'A3', '=3>=2');
  set(sheet, 'A4', '=3<>3');
  set(sheet, 'A5', '="Total: "&7');
  set(sheet, 'A6', '=TRUE=NOT(FALSE)');

  assert.equal(display(sheet, 'A1'), '7');
  assert.equal(display(sheet, 'A2'), '-9');
  assert.equal(display(sheet, 'A3'), 'TRUE');
  assert.equal(display(sheet, 'A4'), 'FALSE');
  assert.equal(display(sheet, 'A5'), 'Total: 7');
  assert.equal(display(sheet, 'A6'), 'TRUE');
});

test('supports required aggregate, logical, numeric, and text functions', () => {
  const sheet = new SpreadsheetModel(10, 8);

  set(sheet, 'A1', '1');
  set(sheet, 'A2', '2');
  set(sheet, 'A3', '3');
  set(sheet, 'B1', '=SUM(A1:A3)');
  set(sheet, 'B2', '=AVERAGE(A1:A3)');
  set(sheet, 'B3', '=MIN(A1:A3)');
  set(sheet, 'B4', '=MAX(A1:A3)');
  set(sheet, 'B5', '=COUNT(A1:A3)');
  set(sheet, 'B6', '=IF(AND(TRUE,OR(FALSE,TRUE)),ABS(-4),0)');
  set(sheet, 'B7', '=ROUND(2.345,2)');
  set(sheet, 'B8', '=CONCAT("A",A1,"B")');

  assert.equal(display(sheet, 'B1'), '6');
  assert.equal(display(sheet, 'B2'), '2');
  assert.equal(display(sheet, 'B3'), '1');
  assert.equal(display(sheet, 'B4'), '3');
  assert.equal(display(sheet, 'B5'), '3');
  assert.equal(display(sheet, 'B6'), '4');
  assert.equal(display(sheet, 'B7'), '2.35');
  assert.equal(display(sheet, 'B8'), 'A1B');
});

test('copying a formula shifts relative references', () => {
  const sheet = new SpreadsheetModel(10, 5);

  set(sheet, 'A1', '4');
  set(sheet, 'B1', '6');
  set(sheet, 'A2', adjustFormulaReferences('=A1*2', 0, 1));

  assert.equal(raw(sheet, 'A2'), '=B1*2');
  assert.equal(display(sheet, 'A2'), '12');
});

test('absolute reference parts do not shift during copy', () => {
  assert.equal(adjustFormulaReferences('=$A$1+$A1+A$1+A1', 2, 3), '=$A$1+$A3+D$1+D3');
});

test('range clear can be restored from one snapshot', () => {
  const sheet = new SpreadsheetModel(10, 5);
  const before = sheet.cloneCells();

  set(sheet, 'A1', 'one');
  set(sheet, 'B1', 'two');
  const snapshot = sheet.cloneCells();
  sheet.setCell(0, 0, '');
  sheet.setCell(0, 1, '');

  assert.equal(raw(sheet, 'A1'), '');
  assert.equal(raw(sheet, 'B1'), '');

  sheet.restoreCells(snapshot);

  assert.equal(raw(sheet, 'A1'), 'one');
  assert.equal(raw(sheet, 'B1'), 'two');
  assert.deepEqual(before, new Map());
});

test('inserting a row preserves references to moved data', () => {
  const sheet = new SpreadsheetModel(10, 5);

  set(sheet, 'A2', '9');
  set(sheet, 'B1', '=A2');
  sheet.insertRow(1);

  assert.equal(raw(sheet, 'A3'), '9');
  assert.equal(raw(sheet, 'B1'), '=A3');
  assert.equal(display(sheet, 'B1'), '9');
});

test('inserting a column preserves references to moved data', () => {
  const sheet = new SpreadsheetModel(10, 5);

  set(sheet, 'B1', '11');
  set(sheet, 'A2', '=B1');
  sheet.insertCol(1);

  assert.equal(raw(sheet, 'C1'), '11');
  assert.equal(raw(sheet, 'A2'), '=C1');
  assert.equal(display(sheet, 'A2'), '11');
});

test('circular references render an error marker', () => {
  const sheet = new SpreadsheetModel(10, 5);

  set(sheet, 'A1', '=B1');
  set(sheet, 'B1', '=A1');

  assert.equal(display(sheet, 'A1'), '#CIRC!');
  assert.equal(display(sheet, 'B1'), '#CIRC!');
});

test('formula errors render stable markers', () => {
  const sheet = new SpreadsheetModel(10, 5);

  set(sheet, 'A1', '=1/0');
  set(sheet, 'A2', '=UNKNOWN(1)');
  set(sheet, 'A3', '=1+');
  set(sheet, 'B1', '7');
  set(sheet, 'C1', '=B1');
  sheet.deleteCol(1);

  assert.equal(display(sheet, 'A1'), '#DIV/0!');
  assert.equal(display(sheet, 'A2'), '#ERR!');
  assert.equal(display(sheet, 'A3'), '#ERR!');
  assert.equal(display(sheet, 'B1'), '#REF!');
});

test('IF evaluates only the selected branch', () => {
  const sheet = new SpreadsheetModel(10, 5);

  set(sheet, 'A1', '=IF(TRUE,1,1/0)');
  set(sheet, 'A2', '=IF(FALSE,1/0,2)');

  assert.equal(display(sheet, 'A1'), '1');
  assert.equal(display(sheet, 'A2'), '2');
});

test('string literals containing deleted-reference text remain strings', () => {
  const sheet = new SpreadsheetModel(10, 5);

  set(sheet, 'A1', '="literal #REF!"');

  assert.equal(display(sheet, 'A1'), 'literal #REF!');
});
