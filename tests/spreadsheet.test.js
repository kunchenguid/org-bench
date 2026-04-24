const test = require('node:test');
const assert = require('node:assert/strict');
const { SpreadsheetModel, adjustFormulaReferences } = require('../spreadsheet-core.js');

function colIndex(name) { return name.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1; }
function pos(ref) { const match = /^([A-Z]+)(\d+)$/.exec(ref); return { row: Number(match[2]) - 1, col: colIndex(match[1]) }; }
function set(sheet, ref, raw) { const p = pos(ref); sheet.setCell(p.row, p.col, raw); }
function raw(sheet, ref) { const p = pos(ref); return sheet.getRaw(p.row, p.col); }
function display(sheet, ref) { const p = pos(ref); return sheet.getDisplay(p.row, p.col); }

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

test('insert row and column preserve references to moved data', () => {
  const sheet = new SpreadsheetModel(10, 5);
  set(sheet, 'A2', '9');
  set(sheet, 'B1', '=A2');
  sheet.insertRow(1);
  assert.equal(raw(sheet, 'A3'), '9');
  assert.equal(raw(sheet, 'B1'), '=A3');
  assert.equal(display(sheet, 'B1'), '9');
  set(sheet, 'B2', '11');
  set(sheet, 'A1', '=B2');
  sheet.insertCol(1);
  assert.equal(raw(sheet, 'C2'), '11');
  assert.equal(raw(sheet, 'A1'), '=C2');
  assert.equal(display(sheet, 'A1'), '11');
});

test('circular references render an error marker', () => {
  const sheet = new SpreadsheetModel(10, 5);
  set(sheet, 'A1', '=B1');
  set(sheet, 'B1', '=A1');
  assert.equal(display(sheet, 'A1'), '#CIRC!');
  assert.equal(display(sheet, 'B1'), '#CIRC!');
});
