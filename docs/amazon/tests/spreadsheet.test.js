const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createStorageKey,
  evaluateCellMap,
} = require('../src/engine.js');

test('createStorageKey prefixes keys with the injected namespace', () => {
  assert.equal(createStorageKey('amazon-run', 'sheet-state'), 'amazon-run:sheet-state');
});

test('evaluateCellMap resolves arithmetic formulas through cell references', () => {
  const result = evaluateCellMap({
    A1: '3',
    A2: '5',
    A3: '=A1+A2*2',
  });

  assert.equal(result.A3.display, '13');
});

test('evaluateCellMap recomputes dependent formulas in order', () => {
  const result = evaluateCellMap({
    A1: '4',
    A2: '=A1+1',
    A3: '=A2*2',
  });

  assert.equal(result.A2.display, '5');
  assert.equal(result.A3.display, '10');
});

test('evaluateCellMap reports circular references clearly', () => {
  const result = evaluateCellMap({
    A1: '=A2',
    A2: '=A1',
  });

  assert.equal(result.A1.display, '#CIRC!');
  assert.equal(result.A2.display, '#CIRC!');
});
