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

test('copying a formula shifts relative references', () => {
  const sheet = new SpreadsheetModel(10, 5);

  set(sheet, 'A1', '4');
  set(sheet, 'B1', '6');
  set(sheet, 'A2', adjustFormulaReferences('=A1*2', 0, 1));

  assert.equal(raw(sheet, 'A2'), '=B1*2');
  assert.equal(display(sheet, 'A2'), '12');
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
