const test = require('node:test');
const assert = require('node:assert/strict');

const { SpreadsheetModel, coordsToRef } = require('../spreadsheet.js');

test('evaluates arithmetic formulas with precedence', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '3');
  sheet.setCellRaw('A2', '4');
  sheet.setCellRaw('A3', '=A1+A2*2');

  assert.equal(sheet.getDisplayValue('A3'), '11');
});

test('supports ranges and aggregate functions', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '2');
  sheet.setCellRaw('A2', '4');
  sheet.setCellRaw('A3', '6');
  sheet.setCellRaw('B1', '=SUM(A1:A3)');
  sheet.setCellRaw('B2', '=AVERAGE(A1:A3)');
  sheet.setCellRaw('B3', '=COUNT(A1:A3)');

  assert.equal(sheet.getDisplayValue('B1'), '12');
  assert.equal(sheet.getDisplayValue('B2'), '4');
  assert.equal(sheet.getDisplayValue('B3'), '3');
});

test('supports comparisons, booleans, and string concatenation', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '5');
  sheet.setCellRaw('A2', '=A1>3');
  sheet.setCellRaw('A3', '=IF(A2, "ok", "no")');
  sheet.setCellRaw('A4', '="Total: "&A1');

  assert.equal(sheet.getDisplayValue('A2'), 'TRUE');
  assert.equal(sheet.getDisplayValue('A3'), 'ok');
  assert.equal(sheet.getDisplayValue('A4'), 'Total: 5');
});

test('detects circular references', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '=B1');
  sheet.setCellRaw('B1', '=A1');

  assert.equal(sheet.getDisplayValue('A1'), '#CIRC!');
  assert.equal(sheet.getDisplayValue('B1'), '#CIRC!');
});

test('copies ranges and shifts relative references on paste', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '2');
  sheet.setCellRaw('A2', '=A1+3');

  sheet.copyRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 0 }, false);
  sheet.pasteRange({ startRow: 0, startCol: 2, endRow: 1, endCol: 2 });

  assert.equal(sheet.getCellRaw('C1'), '2');
  assert.equal(sheet.getCellRaw('C2'), '=C1+3');
  assert.equal(sheet.getDisplayValue('C2'), '5');
});

test('cut moves a block and clears the source range', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '7');
  sheet.setCellRaw('B1', '=A1*2');

  sheet.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 1 }, true);
  sheet.pasteRange({ startRow: 2, startCol: 0, endRow: 2, endCol: 1 });

  assert.equal(sheet.getCellRaw('A1'), '');
  assert.equal(sheet.getCellRaw('B1'), '');
  assert.equal(sheet.getCellRaw('A3'), '7');
  assert.equal(sheet.getCellRaw('B3'), '=A3*2');
  assert.equal(sheet.getDisplayValue('B3'), '14');
});

test('clears every cell in a rectangular range', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '1');
  sheet.setCellRaw('B2', '2');
  sheet.setCellRaw('C3', '3');

  sheet.clearRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });

  assert.equal(sheet.getCellRaw('A1'), '');
  assert.equal(sheet.getCellRaw('B2'), '');
  assert.equal(sheet.getCellRaw('C3'), '3');
});

test('serializes core grid data', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('C3', '=1+2');

  assert.deepEqual(sheet.serialize(), {
    rows: 100,
    cols: 26,
    cells: { C3: '=1+2' },
  });
});

test('converts coordinates to spreadsheet refs', () => {
  assert.equal(coordsToRef(0, 0), 'A1');
  assert.equal(coordsToRef(4, 2), 'C5');
  assert.equal(coordsToRef(99, 25), 'Z100');
});
