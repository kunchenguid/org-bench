const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSheetEngine,
  adjustFormulaReferences,
} = require('./formula-engine.js');

test('parses plain numbers and text cells', () => {
  const sheet = createSheetEngine();

  sheet.setCell('A1', '42');
  sheet.setCell('A2', 'hello');

  assert.equal(sheet.getCell('A1').value, 42);
  assert.equal(sheet.getCell('A1').display, '42');
  assert.equal(sheet.getCell('A2').value, 'hello');
  assert.equal(sheet.getCell('A2').display, 'hello');
});

test('evaluates arithmetic, precedence, unary minus, booleans, comparisons, and concat', () => {
  const sheet = createSheetEngine({
    A1: '4',
    A2: '6',
    B1: '=-(A1+A2*2)',
    B2: '=A2>=A1',
    B3: '="Total: "&(A1+A2)',
    B4: '=TRUE=NOT(FALSE)',
  });

  assert.equal(sheet.getCell('B1').value, -16);
  assert.equal(sheet.getCell('B2').value, true);
  assert.equal(sheet.getCell('B2').display, 'TRUE');
  assert.equal(sheet.getCell('B3').value, 'Total: 10');
  assert.equal(sheet.getCell('B4').value, true);
});

test('supports range functions and empty-cell coercion', () => {
  const sheet = createSheetEngine({
    A1: '10',
    A2: '20',
    A3: '',
    A4: 'x',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
    B3: '=MIN(A1:A3)',
    B4: '=MAX(A1:A3)',
    B5: '=COUNT(A1:A4)',
    B6: '=CONCAT("v=", A3)',
  });

  assert.equal(sheet.getCell('B1').value, 30);
  assert.equal(sheet.getCell('B2').value, 10);
  assert.equal(sheet.getCell('B3').value, 0);
  assert.equal(sheet.getCell('B4').value, 20);
  assert.equal(sheet.getCell('B5').value, 2);
  assert.equal(sheet.getCell('B6').value, 'v=');
});

test('supports logical and conditional functions', () => {
  const sheet = createSheetEngine({
    A1: '5',
    A2: '3',
    B1: '=IF(A1>A2, "win", "lose")',
    B2: '=AND(A1>A2, TRUE, NOT(FALSE))',
    B3: '=OR(FALSE, A2>A1, TRUE)',
    B4: '=ABS(-3.4)',
    B5: '=ROUND(1.234, 2)',
  });

  assert.equal(sheet.getCell('B1').value, 'win');
  assert.equal(sheet.getCell('B2').value, true);
  assert.equal(sheet.getCell('B3').value, true);
  assert.equal(sheet.getCell('B4').value, 3.4);
  assert.equal(sheet.getCell('B5').value, 1.23);
});

test('recalculates dependents when precedent cells change', () => {
  const sheet = createSheetEngine({
    A1: '2',
    A2: '=A1*2',
    A3: '=A2+1',
  });

  assert.equal(sheet.getCell('A3').value, 5);

  sheet.setCell('A1', '7');

  assert.equal(sheet.getCell('A2').value, 14);
  assert.equal(sheet.getCell('A3').value, 15);
});

test('returns spreadsheet-style errors for syntax, unknown functions, divide by zero, bad refs, and circular references', () => {
  const sheet = createSheetEngine({
    A1: '=1+',
    A2: '=MISSING(1)',
    A3: '=1/0',
    A4: '=A0',
    B1: '=B2',
    B2: '=B1',
  });

  assert.equal(sheet.getCell('A1').display, '#ERR!');
  assert.equal(sheet.getCell('A2').display, '#NAME?');
  assert.equal(sheet.getCell('A3').display, '#DIV/0!');
  assert.equal(sheet.getCell('A4').display, '#REF!');
  assert.equal(sheet.getCell('B1').display, '#CIRC!');
  assert.equal(sheet.getCell('B2').display, '#CIRC!');
});

test('tracks dependencies for formulas', () => {
  const sheet = createSheetEngine({
    A1: '1',
    A2: '2',
    B1: '=SUM(A1:A2)',
  });

  assert.deepEqual(sheet.getDependencies('B1'), ['A1', 'A2']);
  assert.deepEqual(sheet.getDependents('A1'), ['B1']);
});

test('adjusts relative and mixed references when formulas are copied', () => {
  assert.equal(adjustFormulaReferences('=A1+$B$2+C$3+$D4', 'A1', 'C3'), '=C3+$B$2+E$3+$D6');
  assert.equal(adjustFormulaReferences('=SUM(A1:B2)', 'A1', 'B3'), '=SUM(B3:C4)');
});
