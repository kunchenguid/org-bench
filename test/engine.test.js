const test = require('node:test');
const assert = require('node:assert/strict');

const { SpreadsheetEngine } = require('../src/engine.js');

test('stores raw cell content and parses plain numbers and text', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '42');
  engine.setCell('A2', 'hello');

  assert.equal(engine.getRawCell('A1'), '42');
  assert.equal(engine.getDisplayValue('A1'), 42);
  assert.equal(engine.getDisplayValue('A2'), 'hello');
});

test('evaluates arithmetic formulas with references and precedence', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '10');
  engine.setCell('A2', '5');
  engine.setCell('B1', '=A1+A2*2');
  engine.setCell('B2', '=(A1+A2)*2');

  assert.equal(engine.getDisplayValue('B1'), 20);
  assert.equal(engine.getDisplayValue('B2'), 30);
});

test('recalculates dependent formulas after precedent changes', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '2');
  engine.setCell('A2', '=A1+3');
  engine.setCell('A3', '=A2*4');

  assert.equal(engine.getDisplayValue('A3'), 20);

  engine.setCell('A1', '5');

  assert.equal(engine.getDisplayValue('A2'), 8);
  assert.equal(engine.getDisplayValue('A3'), 32);
});

test('supports SUM and AVERAGE across ranges', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '2');
  engine.setCell('A2', '4');
  engine.setCell('A3', '6');
  engine.setCell('B1', '=SUM(A1:A3)');
  engine.setCell('B2', '=AVERAGE(A1:A3)');

  assert.equal(engine.getDisplayValue('B1'), 12);
  assert.equal(engine.getDisplayValue('B2'), 4);
});

test('treats empty references as zero in numeric formulas', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('B1', '=A1+5');

  assert.equal(engine.getDisplayValue('B1'), 5);
});

test('marks circular references clearly', () => {
  const engine = new SpreadsheetEngine();

  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');

  assert.equal(engine.getDisplayValue('A1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
});
