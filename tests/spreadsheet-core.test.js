const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SpreadsheetModel,
  columnIndexToName,
  cellKeyFromCoords,
} = require('../spreadsheet.js');

test('evaluates arithmetic formulas with precedence', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '3');
  sheet.setCell('A2', '4');
  sheet.setCell('A3', '=A1+A2*2');

  assert.equal(sheet.getDisplayValue('A3'), '11');
});

test('supports ranges and aggregate functions', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '2');
  sheet.setCell('A2', '4');
  sheet.setCell('A3', '6');
  sheet.setCell('B1', '=SUM(A1:A3)');
  sheet.setCell('B2', '=AVERAGE(A1:A3)');
  sheet.setCell('B3', '=COUNT(A1:A3)');

  assert.equal(sheet.getDisplayValue('B1'), '12');
  assert.equal(sheet.getDisplayValue('B2'), '4');
  assert.equal(sheet.getDisplayValue('B3'), '3');
});

test('supports comparisons, booleans, and string concatenation', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '5');
  sheet.setCell('A2', '=A1>3');
  sheet.setCell('A3', '=IF(A2, "ok", "no")');
  sheet.setCell('A4', '="Total: "&A1');

  assert.equal(sheet.getDisplayValue('A2'), 'TRUE');
  assert.equal(sheet.getDisplayValue('A3'), 'ok');
  assert.equal(sheet.getDisplayValue('A4'), 'Total: 5');
});

test('treats empty references as zero in numeric contexts', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '=B9+2');

  assert.equal(sheet.getDisplayValue('A1'), '2');
});

test('detects circular references', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '=B1');
  sheet.setCell('B1', '=A1');

  assert.equal(sheet.getDisplayValue('A1'), '#CIRC!');
  assert.equal(sheet.getDisplayValue('B1'), '#CIRC!');
});

test('serializes raw cell contents and selected cell', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('C3', '=1+2');
  sheet.selection = { row: 2, col: 2 };

  assert.deepEqual(sheet.serialize(), {
    cells: { C3: '=1+2' },
    selection: { row: 2, col: 2 },
  });
});

test('converts column and cell coordinates', () => {
  assert.equal(columnIndexToName(0), 'A');
  assert.equal(columnIndexToName(25), 'Z');
  assert.equal(cellKeyFromCoords(4, 2), 'C5');
});
