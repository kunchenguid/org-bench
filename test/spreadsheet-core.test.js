const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateSheet,
  shiftFormula,
  rewriteFormulaForStructuralChange,
} = require('../spreadsheet-core.js');

test('evaluates arithmetic and cell references', () => {
  const result = evaluateSheet({
    A1: '2',
    A2: '3',
    A3: '=A1+A2*4',
  });

  assert.equal(result.values.A3.display, '14');
});

test('supports ranges and aggregate functions', () => {
  const result = evaluateSheet({
    A1: '2',
    A2: '4',
    A3: '6',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
    B3: '=COUNT(A1:A3)',
  });

  assert.equal(result.values.B1.display, '12');
  assert.equal(result.values.B2.display, '4');
  assert.equal(result.values.B3.display, '3');
});

test('supports IF, comparisons, booleans, concat, and empty references', () => {
  const result = evaluateSheet({
    A1: '5',
    B1: '=IF(A1>=5, TRUE, FALSE)',
    B2: '="Value: "&A1',
    B3: '=Z99',
  });

  assert.equal(result.values.B1.display, 'TRUE');
  assert.equal(result.values.B2.display, 'Value: 5');
  assert.equal(result.values.B3.display, '0');
});

test('detects circular references', () => {
  const result = evaluateSheet({
    A1: '=B1',
    B1: '=A1',
  });

  assert.equal(result.values.A1.display, '#CIRC!');
  assert.equal(result.values.B1.display, '#CIRC!');
});

test('returns spreadsheet style errors', () => {
  const result = evaluateSheet({
    A1: '=1/0',
    A2: '=MISSING(1)',
    A3: '=1+',
  });

  assert.equal(result.values.A1.display, '#DIV/0!');
  assert.equal(result.values.A2.display, '#ERR!');
  assert.equal(result.values.A3.display, '#ERR!');
});

test('shifts relative references while preserving absolute components', () => {
  assert.equal(shiftFormula('=A1+$B$2+C$3+$D4', 1, 2), '=C2+$B$2+E$3+$D5');
  assert.equal(shiftFormula('=SUM(A1:B2)', 2, 1), '=SUM(B3:C4)');
});

test('rewrites references for inserted and deleted rows and columns', () => {
  assert.equal(
    rewriteFormulaForStructuralChange('=SUM(A1:B3)', { type: 'insert-row', index: 1, count: 1 }),
    '=SUM(A1:B4)'
  );
  assert.equal(
    rewriteFormulaForStructuralChange('=A1+C1', { type: 'insert-col', index: 1, count: 1 }),
    '=A1+D1'
  );
  assert.equal(
    rewriteFormulaForStructuralChange('=B2', { type: 'delete-row', index: 1, count: 1 }),
    '=#REF!'
  );
  assert.equal(
    rewriteFormulaForStructuralChange('=C3', { type: 'delete-col', index: 1, count: 1 }),
    '=B3'
  );
});
