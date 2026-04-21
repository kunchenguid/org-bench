const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SpreadsheetModel,
  parseCellId,
  formatCellId,
  shiftFormula,
  shouldSyncFormulaBar,
} = require('../src/engine.js');

test('parses and formats cell ids', () => {
  assert.deepEqual(parseCellId('C12'), { col: 2, row: 11 });
  assert.equal(formatCellId(25, 99), 'Z100');
});

test('evaluates arithmetic formulas and recomputes dependents', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '2');
  sheet.setCell('A2', '3');
  sheet.setCell('A3', '=A1+A2*4');
  assert.equal(sheet.getDisplayValue('A3'), '14');
  sheet.setCell('A2', '5');
  assert.equal(sheet.getDisplayValue('A3'), '22');
});

test('supports ranges, functions, booleans, and concatenation', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '1');
  sheet.setCell('A2', '2');
  sheet.setCell('A3', '3');
  sheet.setCell('B1', '=SUM(A1:A3)');
  sheet.setCell('B2', '=AVERAGE(A1:A3)');
  sheet.setCell('B3', '=IF(B1>5, "ok", "no")&"!"');
  assert.equal(sheet.getDisplayValue('B1'), '6');
  assert.equal(sheet.getDisplayValue('B2'), '2');
  assert.equal(sheet.getDisplayValue('B3'), 'ok!');
});

test('detects circular references', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '=B1');
  sheet.setCell('B1', '=A1');
  assert.equal(sheet.getDisplayValue('A1'), '#CIRC!');
  assert.equal(sheet.getDisplayValue('B1'), '#CIRC!');
});

test('shifts relative references on paste while keeping absolute ones fixed', () => {
  assert.equal(shiftFormula('=A1+$B$2+C$3+$D4', 1, 2), '=B3+$B$2+D$3+$D6');
});

test('stores undoable operations and row insertion rewrites references', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '10');
  sheet.setCell('A2', '20');
  sheet.setCell('B1', '=SUM(A1:A2)');
  sheet.insertRow(0);
  assert.equal(sheet.getRaw('B2'), '=SUM(A2:A3)');
  assert.equal(sheet.getDisplayValue('B2'), '30');
  sheet.undo();
  assert.equal(sheet.getRaw('B1'), '=SUM(A1:A2)');
  sheet.redo();
  assert.equal(sheet.getRaw('B2'), '=SUM(A2:A3)');
});

test('deleting a referenced row preserves #REF! in formulas and display', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '10');
  sheet.setCell('A2', '20');
  sheet.setCell('B1', '=A2');
  sheet.deleteRow(1);
  assert.equal(sheet.getRaw('B1'), '=#REF!');
  assert.equal(sheet.getDisplayValue('B1'), '#REF!');
});

test('formula bar syncs to the new selection after committing from the formula bar', () => {
  const formulaBar = { id: 'formula-bar' };
  assert.equal(shouldSyncFormulaBar(formulaBar, formulaBar, null), true);
  assert.equal(shouldSyncFormulaBar(formulaBar, formulaBar, '1'), false);
});
