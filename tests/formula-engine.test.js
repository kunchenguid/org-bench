const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheetEngine } = require('../src/formula-engine.js');

test('stores raw values and evaluates formulas with dependencies', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('A3', '=A1+A2*4');

  assert.equal(engine.getCellRaw('A3'), '=A1+A2*4');
  assert.equal(engine.getCellDisplay('A3'), '14');
});

test('supports booleans, comparisons, concatenation, and core functions', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('A1', '2');
  engine.setCell('A2', '5');
  engine.setCell('A3', '=SUM(A1:A2)');
  engine.setCell('A4', '=AVERAGE(A1:A2)');
  engine.setCell('A5', '=MIN(A1:A2)');
  engine.setCell('A6', '=MAX(A1:A2)');
  engine.setCell('A7', '=COUNT(A1:A2)');
  engine.setCell('A8', '=IF(A2>A1, "yes", "no")');
  engine.setCell('A9', '=AND(TRUE, A2>A1, NOT(FALSE))');
  engine.setCell('A10', '=OR(FALSE, A1>A2)');
  engine.setCell('A11', '=ABS(-4)');
  engine.setCell('A12', '=ROUND(1.6)');
  engine.setCell('A13', '=CONCAT("Total:", " ", A3)');
  engine.setCell('A14', '="cmp="&(A2>=A1)');

  assert.equal(engine.getCellDisplay('A3'), '7');
  assert.equal(engine.getCellDisplay('A4'), '3.5');
  assert.equal(engine.getCellDisplay('A5'), '2');
  assert.equal(engine.getCellDisplay('A6'), '5');
  assert.equal(engine.getCellDisplay('A7'), '2');
  assert.equal(engine.getCellDisplay('A8'), 'yes');
  assert.equal(engine.getCellDisplay('A9'), 'TRUE');
  assert.equal(engine.getCellDisplay('A10'), 'FALSE');
  assert.equal(engine.getCellDisplay('A11'), '4');
  assert.equal(engine.getCellDisplay('A12'), '2');
  assert.equal(engine.getCellDisplay('A13'), 'Total: 7');
  assert.equal(engine.getCellDisplay('A14'), 'cmp=TRUE');
});

test('treats empty cells as zero in numeric formulas', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('B1', '=A1+5');
  engine.setCell('B2', '=CONCAT("x", A2)');

  assert.equal(engine.getCellDisplay('B1'), '5');
  assert.equal(engine.getCellDisplay('B2'), 'x');
});

test('returns spreadsheet-style errors for circular refs, syntax errors, bad refs, and divide by zero', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');
  engine.setCell('C1', '=1/0');
  engine.setCell('D1', '=SUM(');
  engine.setCell('E1', '=AA1');

  assert.equal(engine.getCellDisplay('A1'), '#CIRC!');
  assert.equal(engine.getCellDisplay('B1'), '#CIRC!');
  assert.equal(engine.getCellDisplay('C1'), '#DIV/0!');
  assert.equal(engine.getCellDisplay('D1'), '#ERR!');
  assert.equal(engine.getCellDisplay('E1'), '#REF!');
});

test('recomputes dependents in stable order when precedents change', () => {
  const engine = createSpreadsheetEngine();

  engine.setCell('A1', '1');
  engine.setCell('B1', '=A1+1');
  engine.setCell('C1', '=B1+1');

  assert.equal(engine.getCellDisplay('C1'), '3');

  engine.setCell('A1', '10');

  assert.equal(engine.getCellDisplay('B1'), '11');
  assert.equal(engine.getCellDisplay('C1'), '12');
});

test('shifts relative references and preserves absolute references during translation', () => {
  const engine = createSpreadsheetEngine();

  assert.equal(
    engine.translateFormula('=A1+$B2+C$3+$D$4+A1:B2', 'A1', 'C3'),
    '=C3+$B4+E$3+$D$4+C3:D4'
  );
});
