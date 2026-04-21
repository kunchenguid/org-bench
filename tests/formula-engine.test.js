const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  SpreadsheetEngine,
  shiftFormula,
} = require('../src/formula-engine.js');

test('evaluates arithmetic with precedence and parentheses', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '=1+2*3');
  engine.setCell('A2', '=(1+2)*3');
  engine.recalculate();

  assert.equal(engine.getDisplayValue('A1'), 7);
  assert.equal(engine.getDisplayValue('A2'), 9);
});

test('recalculates dependent formulas when precedent cells change', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('B1', '=A1+A2');
  engine.recalculate();
  assert.equal(engine.getDisplayValue('B1'), 5);

  engine.setCell('A2', '10');
  engine.recalculate();
  assert.equal(engine.getDisplayValue('B1'), 12);
});

test('supports ranges and required aggregate functions', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '1');
  engine.setCell('A2', '2');
  engine.setCell('A3', '3');
  engine.setCell('B1', '=SUM(A1:A3)');
  engine.setCell('B2', '=AVERAGE(A1:A3)');
  engine.setCell('B3', '=COUNT(A1:A3)');
  engine.setCell('B4', '=MIN(A1:A3)');
  engine.setCell('B5', '=MAX(A1:A3)');
  engine.recalculate();

  assert.equal(engine.getDisplayValue('B1'), 6);
  assert.equal(engine.getDisplayValue('B2'), 2);
  assert.equal(engine.getDisplayValue('B3'), 3);
  assert.equal(engine.getDisplayValue('B4'), 1);
  assert.equal(engine.getDisplayValue('B5'), 3);
});

test('supports logical, comparison, rounding, absolute and concat functions', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '4.4');
  engine.setCell('A2', '-2');
  engine.setCell('B1', '=IF(A1>4, ROUND(A1), 0)');
  engine.setCell('B2', '=AND(TRUE, NOT(FALSE), A2<0)');
  engine.setCell('B3', '=OR(FALSE, A1=4.4)');
  engine.setCell('B4', '=ABS(A2)');
  engine.setCell('B5', '=CONCAT("Total: ", B1)');
  engine.setCell('B6', '="Value="&B4');
  engine.recalculate();

  assert.equal(engine.getDisplayValue('B1'), 4);
  assert.equal(engine.getDisplayValue('B2'), true);
  assert.equal(engine.getDisplayValue('B3'), true);
  assert.equal(engine.getDisplayValue('B4'), 2);
  assert.equal(engine.getDisplayValue('B5'), 'Total: 4');
  assert.equal(engine.getDisplayValue('B6'), 'Value=2');
});

test('treats empty references as zero in numeric expressions and empty string in text expressions', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '=Z99+1');
  engine.setCell('A2', '="hello"&Z98');
  engine.recalculate();

  assert.equal(engine.getDisplayValue('A1'), 1);
  assert.equal(engine.getDisplayValue('A2'), 'hello');
});

test('surfaces spreadsheet error markers for division by zero, unknown functions, bad syntax, and circular refs', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '=1/0');
  engine.setCell('A2', '=NOPE(1)');
  engine.setCell('A3', '=1+');
  engine.setCell('B1', '=B2');
  engine.setCell('B2', '=B1');
  engine.recalculate();

  assert.equal(engine.getDisplayValue('A1'), '#DIV/0!');
  assert.equal(engine.getDisplayValue('A2'), '#ERR!');
  assert.equal(engine.getDisplayValue('A3'), '#ERR!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B2'), '#CIRC!');
});

test('tracks direct dependencies for formula cells', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '1');
  engine.setCell('A2', '2');
  engine.setCell('B1', '=SUM(A1:A2)+A2');
  engine.recalculate();

  assert.deepEqual(engine.getDependencies('B1'), ['A1', 'A2']);
});

test('shifts only relative reference components when formulas are copied', () => {
  assert.equal(shiftFormula('=A1+$B$2+C$3+$D4', 'A1', 'C3'), '=C3+$B$2+E$3+$D6');
  assert.equal(shiftFormula('=SUM(A1:B2)', 'B2', 'C4'), '=SUM(B3:C4)');
});

test('updates references on row and column insertion or deletion', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '1');
  engine.setCell('A2', '2');
  engine.setCell('B1', '=SUM(A1:A2)');
  engine.recalculate();
  assert.equal(engine.getDisplayValue('B1'), 3);

  engine.insertRows(2, 1);
  engine.setCell('A2', '5');
  engine.recalculate();
  assert.equal(engine.getFormula('B1'), '=SUM(A1:A3)');
  assert.equal(engine.getDisplayValue('B1'), 8);

  engine.deleteColumns(1, 1);
  engine.recalculate();
  assert.equal(engine.getDisplayValue('A1'), '#REF!');
});

test('exposes the engine on a browser global for plain script-tag integration', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/formula-engine.js'), 'utf8');
  const context = { window: {} };

  vm.runInNewContext(source, context);

  assert.equal(typeof context.window.SpreadsheetFormulaEngine.SpreadsheetEngine, 'function');
  assert.equal(typeof context.window.SpreadsheetFormulaEngine.shiftFormula, 'function');
});
