const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateSheet } = require('./formula.js');

test('evaluates arithmetic formulas with references and functions', () => {
  const result = evaluateSheet({
    A1: '2',
    A2: '3',
    A3: '=A1+A2*4',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
    B3: '=IF(B1>15, MAX(A1:A3), MIN(A1:A3))',
  });

  assert.equal(result.A3.value, 14);
  assert.equal(result.B1.value, 19);
  assert.equal(result.B2.value, 19 / 3);
  assert.equal(result.B3.value, 14);
});

test('treats empty references as zero in numeric contexts', () => {
  const result = evaluateSheet({
    A1: '=Z99+5',
  });

  assert.equal(result.A1.value, 5);
});

test('reports circular references and divide by zero errors', () => {
  const result = evaluateSheet({
    A1: '=B1',
    B1: '=A1',
    C1: '=10/0',
  });

  assert.equal(result.A1.display, '#CIRC!');
  assert.equal(result.B1.display, '#CIRC!');
  assert.equal(result.C1.display, '#DIV/0!');
});

test('reports syntax and unknown function errors', () => {
  const result = evaluateSheet({
    A1: '=SUM(1,)',
    A2: '=NOPE(1)',
  });

  assert.equal(result.A1.display, '#ERR!');
  assert.equal(result.A2.display, '#NAME?');
});
