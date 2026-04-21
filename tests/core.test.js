const test = require('node:test');
const assert = require('node:assert/strict');

const { createEngine } = require('../core.js');

test('evaluates numbers, text, and simple formulas with references', () => {
  const engine = createEngine();

  engine.setCell('A1', '12');
  engine.setCell('A2', '8');
  engine.setCell('B1', '=A1+A2');
  engine.setCell('B2', '=A1/A2');
  engine.setCell('C1', 'hello');

  assert.equal(engine.getDisplayValue('A1'), '12');
  assert.equal(engine.getDisplayValue('B1'), '20');
  assert.equal(engine.getDisplayValue('B2'), '1.5');
  assert.equal(engine.getDisplayValue('C1'), 'hello');
});

test('supports SUM over ranges and updates dependents', () => {
  const engine = createEngine();

  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('A3', '5');
  engine.setCell('B1', '=SUM(A1:A3)');

  assert.equal(engine.getDisplayValue('B1'), '10');

  engine.setCell('A2', '7');

  assert.equal(engine.getDisplayValue('B1'), '14');
});

test('detects circular references', () => {
  const engine = createEngine();

  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');

  assert.equal(engine.getDisplayValue('A1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
});

test('shifts relative references when copied', () => {
  const engine = createEngine();

  engine.setCell('A1', '1');
  engine.setCell('A2', '2');
  engine.setCell('B1', '=A1+A2');

  const copied = engine.copyRawBlock({ startRow: 1, startCol: 2, endRow: 1, endCol: 2 });
  engine.pasteRawBlock(copied, { row: 1, col: 3 });

  assert.equal(engine.getRawValue('C1'), '=B1+B2');
});
