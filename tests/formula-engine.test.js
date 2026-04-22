const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FormulaEngine,
  shiftFormula,
  rewriteFormulaOnRowInsert,
  rewriteFormulaOnRowDelete,
  rewriteFormulaOnColumnInsert,
  rewriteFormulaOnColumnDelete,
} = require('../src/formula-engine.js');

test('evaluates arithmetic, text, booleans, and built-in functions', () => {
  const engine = new FormulaEngine({
    A1: '10',
    A2: '5',
    A3: '=A1+A2*2',
    A4: '=IF(A3>15, "big", "small")',
    A5: '=CONCAT("Total: ", A3)',
    A6: '=AND(TRUE, NOT(FALSE), A1>A2)',
    A7: '=SUM(A1:A2, 3)',
    A8: '=ROUND(AVERAGE(A1:A2), 0)',
  });

  assert.equal(engine.getDisplayValue('A3'), '20');
  assert.equal(engine.getDisplayValue('A4'), 'big');
  assert.equal(engine.getDisplayValue('A5'), 'Total: 20');
  assert.equal(engine.getDisplayValue('A6'), 'TRUE');
  assert.equal(engine.getDisplayValue('A7'), '18');
  assert.equal(engine.getDisplayValue('A8'), '8');
});

test('recomputes dependents and treats empty references contextually', () => {
  const engine = new FormulaEngine({
    A1: '2',
    B1: '=A1+C1',
    B2: '="x"&C1',
  });

  assert.equal(engine.getDisplayValue('B1'), '2');
  assert.equal(engine.getDisplayValue('B2'), 'x');

  engine.setCell('C1', '4');

  assert.equal(engine.getDisplayValue('B1'), '6');
  assert.equal(engine.getDisplayValue('B2'), 'x4');
});

test('detects circular references and preserves raw formulas', () => {
  const engine = new FormulaEngine({
    A1: '=B1',
    B1: '=A1',
  });

  assert.equal(engine.getDisplayValue('A1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
  assert.equal(engine.getRawValue('A1'), '=B1');
});

test('returns spreadsheet-style errors for divide by zero, bad syntax, and unknown functions', () => {
  const engine = new FormulaEngine({
    A1: '=1/0',
    A2: '=SUM(',
    A3: '=MISSING(1)',
  });

  assert.equal(engine.getDisplayValue('A1'), '#DIV/0!');
  assert.equal(engine.getDisplayValue('A2'), '#ERR!');
  assert.equal(engine.getDisplayValue('A3'), '#ERR!');
});

test('supports relative and absolute copy-paste shifting', () => {
  assert.equal(shiftFormula('=A1+$B$2+C$3+$D4', 'A1', 'C3'), '=C3+$B$2+E$3+$D6');
});

test('rewrites formulas on row insert and delete', () => {
  assert.equal(rewriteFormulaOnRowInsert('=SUM(A1:A3)+B4', 2, 1), '=SUM(A1:A4)+B5');
  assert.equal(rewriteFormulaOnRowDelete('=SUM(A1:A5)+B6', 2, 2), '=SUM(A1:A3)+B4');
  assert.equal(rewriteFormulaOnRowDelete('=B3', 3, 1), '=#REF!');
});

test('rewrites formulas on column insert and delete', () => {
  assert.equal(rewriteFormulaOnColumnInsert('=SUM(A1:B2)+C3', 2, 1), '=SUM(A1:C2)+D3');
  assert.equal(rewriteFormulaOnColumnDelete('=SUM(A1:D2)+E3', 2, 2), '=SUM(A1:B2)+C3');
  assert.equal(rewriteFormulaOnColumnDelete('=C3', 3, 1), '=#REF!');
});

test('exposes dependency information after recalculation', () => {
  const engine = new FormulaEngine({
    A1: '1',
    A2: '=A1+1',
    A3: '=A2+1',
  });

  assert.deepEqual(Array.from(engine.getDependencies('A3')).sort(), ['A2']);
  assert.deepEqual(Array.from(engine.getDependents('A1')).sort(), ['A2']);
  assert.deepEqual(Array.from(engine.getDependents('A2')).sort(), ['A3']);
});
