const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateSheet,
  normalizeInput,
} = require('../spreadsheet-engine.js');

test('treats non-formula input as numbers or literal text', () => {
  const sheet = evaluateSheet({
    A1: '42',
    A2: 'hello',
    A3: '',
  });

  assert.equal(normalizeInput('42').type, 'number');
  assert.equal(sheet.A1.display, '42');
  assert.equal(sheet.A2.display, 'hello');
  assert.equal(sheet.A3.display, '');
});

test('evaluates arithmetic and cell references', () => {
  const sheet = evaluateSheet({
    A1: '10',
    A2: '5',
    B1: '=A1+A2*2',
    B2: '=-(A1-A2)',
  });

  assert.equal(sheet.B1.value, 20);
  assert.equal(sheet.B1.display, '20');
  assert.equal(sheet.B2.value, -5);
});

test('evaluates range functions and empty references as zero', () => {
  const sheet = evaluateSheet({
    A1: '2',
    A2: '4',
    A3: '',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
    B3: '=COUNT(A1:A3)',
    B4: '=MIN(A1:A3)',
    B5: '=MAX(A1:A3)',
    B6: '=A3+1',
  });

  assert.equal(sheet.B1.value, 6);
  assert.equal(sheet.B2.value, 2);
  assert.equal(sheet.B3.value, 2);
  assert.equal(sheet.B4.value, 0);
  assert.equal(sheet.B5.value, 4);
  assert.equal(sheet.B6.value, 1);
});

test('supports IF with comparison operators', () => {
  const sheet = evaluateSheet({
    A1: '7',
    B1: '=IF(A1>5, 1, 0)',
    B2: '=IF(A1<5, 1, 0)',
    B3: '=IF(A1=7, 3, 9)',
  });

  assert.equal(sheet.B1.value, 1);
  assert.equal(sheet.B2.value, 0);
  assert.equal(sheet.B3.value, 3);
});

test('returns clear error markers for divide by zero, syntax errors, and circular references', () => {
  const sheet = evaluateSheet({
    A1: '=1/0',
    A2: '=SUM(',
    A3: '=A4',
    A4: '=A3',
  });

  assert.equal(sheet.A1.display, '#DIV/0!');
  assert.equal(sheet.A2.display, '#ERR!');
  assert.equal(sheet.A3.display, '#CIRC!');
  assert.equal(sheet.A4.display, '#CIRC!');
});
