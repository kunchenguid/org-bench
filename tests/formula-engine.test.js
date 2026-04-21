const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetEngine,
  shiftFormula,
  updateFormulaForStructuralChange,
} = require('../src/formula-engine.js');

test('stores raw contents and evaluates primitive values', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('A1', '42');
  engine.setCell('A2', 'hello');
  engine.setCell('A3', '=TRUE');

  assert.equal(engine.getCellInput('A1'), '42');
  assert.equal(engine.getDisplayValue('A1'), 42);
  assert.equal(engine.getDisplayValue('A2'), 'hello');
  assert.equal(engine.getDisplayValue('A3'), true);
});

test('evaluates arithmetic, concatenation, comparisons, and functions', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('A1', '10');
  engine.setCell('A2', '20');
  engine.setCell('A3', '=A1 + A2 * 2');
  engine.setCell('A4', '="Total: " & SUM(A1:A2)');
  engine.setCell('A5', '=A2 >= A1');
  engine.setCell('A6', '=ROUND(AVERAGE(A1:A2) / 3, 2)');
  engine.setCell('A7', '=IF(A1 < A2, CONCAT("ok", "!"), "no")');

  assert.equal(engine.getDisplayValue('A3'), 50);
  assert.equal(engine.getDisplayValue('A4'), 'Total: 30');
  assert.equal(engine.getDisplayValue('A5'), true);
  assert.equal(engine.getDisplayValue('A6'), 5);
  assert.equal(engine.getDisplayValue('A7'), 'ok!');
});

test('treats empty references consistently across numeric and text contexts', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('B1', '=A1 + 5');
  engine.setCell('B2', '="x" & A1');

  assert.equal(engine.getDisplayValue('B1'), 5);
  assert.equal(engine.getDisplayValue('B2'), 'x');
});

test('recomputes dependent formulas when precedents change', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('A1', '2');
  engine.setCell('A2', '=A1 * 3');
  engine.setCell('A3', '=A2 + 1');

  assert.equal(engine.getDisplayValue('A3'), 7);

  engine.setCell('A1', '5');

  assert.equal(engine.getDisplayValue('A2'), 15);
  assert.equal(engine.getDisplayValue('A3'), 16);
});

test('detects circular references', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');

  assert.equal(engine.getDisplayText('A1'), '#CIRC!');
  assert.equal(engine.getDisplayText('B1'), '#CIRC!');
});

test('returns spreadsheet error markers for syntax, unknown functions, divide by zero, and bad references', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('A1', '=1 +');
  engine.setCell('A2', '=MISSING(1)');
  engine.setCell('A3', '=1 / 0');
  engine.setCell('A4', '=#REF! + 1');

  assert.equal(engine.getDisplayText('A1'), '#ERR!');
  assert.equal(engine.getDisplayText('A2'), '#NAME?');
  assert.equal(engine.getDisplayText('A3'), '#DIV/0!');
  assert.equal(engine.getDisplayText('A4'), '#REF!');
});

test('supports logical functions and range functions', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('A1', '1');
  engine.setCell('A2', '2');
  engine.setCell('A3', '3');
  engine.setCell('B1', '=SUM(A1:A3)');
  engine.setCell('B2', '=MIN(A1:A3)');
  engine.setCell('B3', '=MAX(A1:A3)');
  engine.setCell('B4', '=COUNT(A1:A3)');
  engine.setCell('B5', '=AND(TRUE, A1 < A3, NOT(FALSE))');
  engine.setCell('B6', '=OR(FALSE, A1 > A2, TRUE)');
  engine.setCell('B7', '=ABS(-7)');

  assert.equal(engine.getDisplayValue('B1'), 6);
  assert.equal(engine.getDisplayValue('B2'), 1);
  assert.equal(engine.getDisplayValue('B3'), 3);
  assert.equal(engine.getDisplayValue('B4'), 3);
  assert.equal(engine.getDisplayValue('B5'), true);
  assert.equal(engine.getDisplayValue('B6'), true);
  assert.equal(engine.getDisplayValue('B7'), 7);
});

test('shifts relative references on paste while preserving absolute parts', () => {
  assert.equal(shiftFormula('=A1+$B1+C$1+$D$1+A1:B2', 2, 3), '=D3+$B3+F$1+$D$1+D3:E4');
});

test('updates formulas for row insertions and deletions', () => {
  assert.equal(
    updateFormulaForStructuralChange('=SUM(A1:B2)+C3', {
      type: 'insert-row',
      index: 2,
      count: 1,
    }),
    '=SUM(A1:B3)+C4'
  );

  assert.equal(
    updateFormulaForStructuralChange('=A1+B2+C3', {
      type: 'delete-row',
      index: 2,
      count: 1,
    }),
    '=A1+#REF!+C2'
  );
});

test('updates formulas for column insertions and deletions', () => {
  assert.equal(
    updateFormulaForStructuralChange('=SUM(A1:B2)+C3', {
      type: 'insert-column',
      index: 2,
      count: 1,
    }),
    '=SUM(A1:C2)+D3'
  );

  assert.equal(
    updateFormulaForStructuralChange('=A1+B2+C3', {
      type: 'delete-column',
      index: 2,
      count: 1,
    }),
    '=A1+#REF!+B3'
  );
});
