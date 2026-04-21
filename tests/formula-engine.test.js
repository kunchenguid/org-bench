const test = require('node:test');
const assert = require('node:assert/strict');

const { createFormulaEngine, translateFormula } = require('../src/formula-engine.js');

test('evaluates literals, arithmetic, concatenation, and comparisons', () => {
  const engine = createFormulaEngine();

  engine.setCell('A1', '2');
  engine.setCell('A2', '=A1*5+3');
  engine.setCell('A3', '="Total: "&A2');
  engine.setCell('A4', '=A2>=13');

  assert.equal(engine.getCellDisplay('A2'), '13');
  assert.equal(engine.getCellDisplay('A3'), 'Total: 13');
  assert.equal(engine.getCellDisplay('A4'), 'TRUE');
});

test('recalculates dependents and supports ranges and built-in functions', () => {
  const engine = createFormulaEngine();

  engine.setCell('A1', '1');
  engine.setCell('A2', '2');
  engine.setCell('A3', '3');
  engine.setCell('B1', '=SUM(A1:A3)');
  engine.setCell('B2', '=AVERAGE(A1:A3)');
  engine.setCell('B3', '=COUNT(A1:A3)');
  engine.setCell('B4', '=IF(B1=6,MAX(A1:A3),0)');

  assert.equal(engine.getCellDisplay('B1'), '6');
  assert.equal(engine.getCellDisplay('B2'), '2');
  assert.equal(engine.getCellDisplay('B3'), '3');
  assert.equal(engine.getCellDisplay('B4'), '3');

  engine.setCell('A3', '6');

  assert.equal(engine.getCellDisplay('B1'), '9');
  assert.equal(engine.getCellDisplay('B2'), '3');
  assert.equal(engine.getCellDisplay('B4'), '0');
});

test('reports circular references and spreadsheet-style errors', () => {
  const engine = createFormulaEngine();

  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');
  engine.setCell('C1', '=1/0');
  engine.setCell('D1', '=MISSING(1)');

  assert.equal(engine.getCellDisplay('A1'), '#CIRC!');
  assert.equal(engine.getCellDisplay('B1'), '#CIRC!');
  assert.equal(engine.getCellDisplay('C1'), '#DIV/0!');
  assert.equal(engine.getCellDisplay('D1'), '#NAME?');
});

test('keeps raw formulas and adjusts relative and absolute references when translated', () => {
  const engine = createFormulaEngine();

  engine.setCell('C3', '=$A1+B$2+C3');

  assert.equal(engine.getCellRaw('C3'), '=$A1+B$2+C3');
  assert.equal(translateFormula('=$A1+B$2+C3', 'C3', 'E5'), '=$A3+D$2+E5');
});

test('treats empty references as zero or empty string depending on context', () => {
  const engine = createFormulaEngine();

  engine.setCell('A1', '=B1+5');
  engine.setCell('A2', '="x"&B1');
  engine.setCell('A3', '=NOT(B1)');

  assert.equal(engine.getCellDisplay('A1'), '5');
  assert.equal(engine.getCellDisplay('A2'), 'x');
  assert.equal(engine.getCellDisplay('A3'), 'TRUE');
});
