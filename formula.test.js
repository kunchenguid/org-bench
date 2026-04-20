const test = require('node:test');
const assert = require('node:assert/strict');

const { createFormulaEngine } = require('./formula.js');

test('evaluates arithmetic and cell references', () => {
  const engine = createFormulaEngine({
    A1: '2',
    A2: '3',
    B1: '=A1+A2*4',
  });

  assert.equal(engine.getDisplayValue('B1'), '14');
});

test('supports SUM and AVERAGE across ranges', () => {
  const engine = createFormulaEngine({
    A1: '1',
    A2: '2',
    A3: '3',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
  });

  assert.equal(engine.getDisplayValue('B1'), '6');
  assert.equal(engine.getDisplayValue('B2'), '2');
});

test('detects circular references', () => {
  const engine = createFormulaEngine({
    A1: '=B1',
    B1: '=A1',
  });

  assert.equal(engine.getDisplayValue('A1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
});

test('returns spreadsheet-like error markers', () => {
  const engine = createFormulaEngine({
    A1: '=1/0',
    A2: '=MISSING(1)',
  });

  assert.equal(engine.getDisplayValue('A1'), '#DIV/0!');
  assert.equal(engine.getDisplayValue('A2'), '#NAME?');
});

test('treats empty references as zero in numeric contexts', () => {
  const engine = createFormulaEngine({
    B1: '=A1+5',
  });

  assert.equal(engine.getDisplayValue('B1'), '5');
});
