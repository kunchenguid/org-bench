const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createWorkbook,
  shiftFormula,
} = require('../formula.js');

test('evaluates arithmetic and range functions across references', () => {
  const workbook = createWorkbook();

  workbook.setCell('A1', '2');
  workbook.setCell('A2', '3');
  workbook.setCell('B1', '=A1+A2*4');
  workbook.setCell('B2', '=SUM(A1:A2)');
  workbook.setCell('B3', '="Total: "&B2');

  assert.equal(workbook.getDisplayValue('B1'), '14');
  assert.equal(workbook.getDisplayValue('B2'), '5');
  assert.equal(workbook.getDisplayValue('B3'), 'Total: 5');
});

test('detects circular references', () => {
  const workbook = createWorkbook();

  workbook.setCell('A1', '=B1');
  workbook.setCell('B1', '=A1');

  assert.equal(workbook.getDisplayValue('A1'), '#CIRC!');
  assert.equal(workbook.getDisplayValue('B1'), '#CIRC!');
});

test('shifts only relative references when copying formulas', () => {
  assert.equal(shiftFormula('=A1+$B1+C$1+$D$1', 2, 1), '=B3+$B3+D$1+$D$1');
});
