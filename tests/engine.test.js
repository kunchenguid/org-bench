const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSheet,
  setCell,
  evaluateSheet,
  copyFormula,
  applyStructuralChange,
} = require('../engine.js');

test('evaluates arithmetic and dependent references', () => {
  const sheet = createSheet(4, 4);
  setCell(sheet, 0, 0, '4');
  setCell(sheet, 1, 0, '6');
  setCell(sheet, 2, 0, '=A1+A2*2');

  const result = evaluateSheet(sheet);
  assert.equal(result.display['A3'], '16');
});

test('supports ranges, functions, concatenation, and booleans', () => {
  const sheet = createSheet(4, 4);
  setCell(sheet, 0, 0, '1');
  setCell(sheet, 1, 0, '2');
  setCell(sheet, 2, 0, '3');
  setCell(sheet, 3, 0, '=CONCAT("Total: ",SUM(A1:A3)," / ",IF(AND(TRUE, AVERAGE(A1:A3)>1),"ok","no"))');

  const result = evaluateSheet(sheet);
  assert.equal(result.display['A4'], 'Total: 6 / ok');
});

test('detects circular references', () => {
  const sheet = createSheet(3, 3);
  setCell(sheet, 0, 0, '=B1');
  setCell(sheet, 0, 1, '=A1');

  const result = evaluateSheet(sheet);
  assert.equal(result.display['A1'], '#CIRC!');
  assert.equal(result.display['B1'], '#CIRC!');
});

test('shifts relative references when copied', () => {
  assert.equal(copyFormula('=A1+$B2+C$3+$D$4', { row: 0, col: 0 }, { row: 1, col: 2 }), '=C2+$B3+E$3+$D$4');
});

test('updates formulas when rows are inserted and deleted', () => {
  assert.equal(applyStructuralChange('=SUM(A1:B2)+C3', { type: 'insert-row', index: 1, count: 1 }), '=SUM(A1:B3)+C4');
  assert.equal(applyStructuralChange('=A1+B2+C3', { type: 'delete-row', index: 1, count: 1 }), '=A1+#REF!+C2');
});

test('updates formulas when columns are inserted and deleted', () => {
  assert.equal(applyStructuralChange('=SUM(A1:B2)+C3', { type: 'insert-col', index: 1, count: 1 }), '=SUM(A1:C2)+D3');
  assert.equal(applyStructuralChange('=A1+B2+C3', { type: 'delete-col', index: 1, count: 1 }), '=A1+#REF!+B3');
});
