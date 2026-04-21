const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSheet,
  evaluateCell,
  moveFormula,
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
