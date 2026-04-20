const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateCell,
  evaluateSheet,
} = require('../src/formula.js');

test('evaluates arithmetic with cell references and operator precedence', () => {
  const sheet = {
    A1: '2',
    A2: '3',
    B1: '=A1+A2*4',
  };

  assert.equal(evaluateCell('B1', sheet).display, '14');
});

test('supports aggregate functions over ranges', () => {
  const sheet = {
    A1: '5',
    A2: '7',
    A3: '9',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
    B3: '=COUNT(A1:A3)',
    B4: '=MIN(A1:A3)',
    B5: '=MAX(A1:A3)',
  };

  const evaluated = evaluateSheet(sheet);

  assert.equal(evaluated.B1.display, '21');
  assert.equal(evaluated.B2.display, '7');
  assert.equal(evaluated.B3.display, '3');
  assert.equal(evaluated.B4.display, '5');
  assert.equal(evaluated.B5.display, '9');
});

test('treats empty cells as zero in numeric contexts and supports IF', () => {
  const sheet = {
    A1: '',
    B1: '=A1+4',
    B2: '=IF(B1>3,10,0)',
  };

  const evaluated = evaluateSheet(sheet);

  assert.equal(evaluated.B1.display, '4');
  assert.equal(evaluated.B2.display, '10');
});

test('reports circular references and divide-by-zero errors', () => {
  const sheet = {
    A1: '=B1',
    B1: '=A1',
    C1: '=4/0',
  };

  const evaluated = evaluateSheet(sheet);

  assert.equal(evaluated.A1.display, '#CIRC!');
  assert.equal(evaluated.B1.display, '#CIRC!');
  assert.equal(evaluated.C1.display, '#DIV/0!');
});

test('preserves literal text and reports syntax errors', () => {
  const sheet = {
    A1: 'hello',
    B1: '=SUM(',
  };

  const evaluated = evaluateSheet(sheet);

  assert.equal(evaluated.A1.display, 'hello');
  assert.equal(evaluated.B1.display, '#ERR!');
});
