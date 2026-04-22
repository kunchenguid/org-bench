const test = require('node:test');
const assert = require('node:assert/strict');

const { SpreadsheetEngine } = require('../src/engine.js');

test('stores raw cells and evaluates arithmetic formulas through references', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '10');
  engine.setCell('A2', '5');
  engine.setCell('B1', '=A1+A2*2');

  assert.equal(engine.getCellRaw('B1'), '=A1+A2*2');
  assert.equal(engine.getCellDisplay('B1'), '20');
});

test('recalculates dependent formulas when precedent cells change', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '2');
  engine.setCell('B1', '=A1*3');
  assert.equal(engine.getCellDisplay('B1'), '6');

  engine.setCell('A1', '4');
  assert.equal(engine.getCellDisplay('B1'), '12');
});

test('supports ranges and built-in functions', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '1');
  engine.setCell('A2', '2');
  engine.setCell('A3', '3');
  engine.setCell('B1', '=SUM(A1:A3)');
  engine.setCell('B2', '=AVERAGE(A1:A3)');
  engine.setCell('B3', '=IF(B1>5,CONCAT("Total:"," ",B1),"small")');

  assert.equal(engine.getCellDisplay('B1'), '6');
  assert.equal(engine.getCellDisplay('B2'), '2');
  assert.equal(engine.getCellDisplay('B3'), 'Total: 6');
});

test('renders clear error markers for divide by zero, syntax errors, and unknown functions', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '=1/0');
  engine.setCell('A2', '=SUM(');
  engine.setCell('A3', '=MISSING(1)');

  assert.equal(engine.getCellDisplay('A1'), '#DIV/0!');
  assert.equal(engine.getCellDisplay('A2'), '#ERR!');
  assert.equal(engine.getCellDisplay('A3'), '#ERR!');
});

test('detects circular references without crashing', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');

  assert.equal(engine.getCellDisplay('A1'), '#CIRC!');
  assert.equal(engine.getCellDisplay('B1'), '#CIRC!');
});

test('shifts relative references while preserving absolute ones during copy paste', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '2');
  engine.setCell('B1', '3');
  engine.setCell('C1', '=A1+$B$1');

  engine.copyRange('C1:C1', 'C2');

  assert.equal(engine.getCellRaw('C2'), '=A2+$B$1');
});

test('rewrites references when inserting and deleting rows and columns', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '1');
  engine.setCell('B2', '4');
  engine.setCell('C3', '=A1+B2');

  engine.insertRow(2);
  assert.equal(engine.getCellRaw('C4'), '=A1+B3');

  engine.insertColumn(2);
  assert.equal(engine.getCellRaw('D4'), '=A1+C3');

  engine.deleteRow(1);
  assert.equal(engine.getCellRaw('D3'), '=#REF!+C2');

  engine.deleteColumn(3);
  assert.equal(engine.getCellRaw('C3'), '=#REF!+#REF!');
  assert.equal(engine.getCellDisplay('C3'), '#REF!');
});

test('treats empty references as zero in numeric formulas and empty string in text formulas', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '=B1+5');
  engine.setCell('A2', '="Hello"&B2');

  assert.equal(engine.getCellDisplay('A1'), '5');
  assert.equal(engine.getCellDisplay('A2'), 'Hello');
});
