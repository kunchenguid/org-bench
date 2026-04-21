const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createWorkbook,
  evaluateCell,
  getCellDisplay,
  shiftFormula,
} = require('../src/formula.js');

test('evaluates arithmetic formulas with references', () => {
  const workbook = createWorkbook({
    A1: '10',
    A2: '5',
    A3: '=A1+A2*2',
  });

  assert.equal(evaluateCell(workbook, 'A3').value, 20);
  assert.equal(getCellDisplay(workbook, 'A3'), '20');
});

test('evaluates ranges and core functions', () => {
  const workbook = createWorkbook({
    A1: '2',
    A2: '4',
    A3: '6',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
    B3: '=COUNT(A1:A3)',
    B4: '=MIN(A1:A3)',
    B5: '=MAX(A1:A3)',
  });

  assert.equal(getCellDisplay(workbook, 'B1'), '12');
  assert.equal(getCellDisplay(workbook, 'B2'), '4');
  assert.equal(getCellDisplay(workbook, 'B3'), '3');
  assert.equal(getCellDisplay(workbook, 'B4'), '2');
  assert.equal(getCellDisplay(workbook, 'B5'), '6');
});

test('supports boolean logic, comparisons, concat, and if', () => {
  const workbook = createWorkbook({
    A1: '7',
    A2: '3',
    B1: '=A1>A2',
    B2: '=IF(B1, "win", "lose")',
    B3: '=CONCAT("Total: ", A1+A2)',
    B4: '=AND(TRUE, NOT(FALSE), A1>=7)',
    B5: '=OR(FALSE, A2=3)',
    B6: '=ROUND(10/3, 2)',
    B7: '=ABS(-4)',
    B8: '=CONCAT("flag ", B1)',
  });

  assert.equal(getCellDisplay(workbook, 'B1'), 'TRUE');
  assert.equal(getCellDisplay(workbook, 'B2'), 'win');
  assert.equal(getCellDisplay(workbook, 'B3'), 'Total: 10');
  assert.equal(getCellDisplay(workbook, 'B4'), 'TRUE');
  assert.equal(getCellDisplay(workbook, 'B5'), 'TRUE');
  assert.equal(getCellDisplay(workbook, 'B6'), '3.33');
  assert.equal(getCellDisplay(workbook, 'B7'), '4');
  assert.equal(getCellDisplay(workbook, 'B8'), 'flag TRUE');
});

test('returns spreadsheet-style errors for circular references and invalid formulas', () => {
  const workbook = createWorkbook({
    A1: '=B1',
    B1: '=A1',
    C1: '=1/0',
    D1: '=MISSING(1)',
    E1: '=A1+',
  });

  assert.equal(getCellDisplay(workbook, 'A1'), '#CIRC!');
  assert.equal(getCellDisplay(workbook, 'B1'), '#CIRC!');
  assert.equal(getCellDisplay(workbook, 'C1'), '#DIV/0!');
  assert.equal(getCellDisplay(workbook, 'D1'), '#ERR!');
  assert.equal(getCellDisplay(workbook, 'E1'), '#ERR!');
});

test('shifts relative references when formulas are pasted', () => {
  assert.equal(shiftFormula('=A1+$B1+C$1+$D$1', 1, 2), '=C2+$B2+E$1+$D$1');
  assert.equal(shiftFormula('=SUM(A1:B2)', 2, 1), '=SUM(B3:C4)');
});
