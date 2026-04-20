const assert = require('node:assert/strict');

const { evaluateSheet } = require('./spreadsheet-core.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('evaluates numbers, text, and arithmetic formulas with references', () => {
  const sheet = evaluateSheet({
    A1: '12',
    A2: '7',
    A3: '=A1+A2*2',
    B1: 'hello',
  });

  assert.equal(sheet.A1.value, 12);
  assert.equal(sheet.B1.value, 'hello');
  assert.equal(sheet.A3.value, 26);
});

test('supports SUM across a range', () => {
  const sheet = evaluateSheet({
    A1: '2',
    A2: '3',
    A3: '5',
    B1: '=SUM(A1:A3)',
  });

  assert.equal(sheet.B1.value, 10);
});

test('recomputes dependent formulas and detects simple circular references', () => {
  const sheet = evaluateSheet({
    A1: '=B1',
    B1: '=A1',
    C1: '=A2+1',
    A2: '4',
  });

  assert.equal(sheet.A1.display, '#CIRC!');
  assert.equal(sheet.B1.display, '#CIRC!');
  assert.equal(sheet.C1.value, 5);
});
