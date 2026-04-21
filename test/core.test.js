const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateSpreadsheet,
  shiftFormula,
} = require('../spreadsheet-core.js');

test('treats numbers and text differently', () => {
  const sheet = evaluateSpreadsheet({
    A1: '42',
    A2: 'hello',
  });

  assert.equal(sheet.A1.display, '42');
  assert.equal(sheet.A2.display, 'hello');
});

test('evaluates arithmetic formulas with cell references', () => {
  const sheet = evaluateSpreadsheet({
    A1: '2',
    A2: '3',
    A3: '=A1+A2*4',
  });

  assert.equal(sheet.A3.display, '14');
});

test('evaluates range functions', () => {
  const sheet = evaluateSpreadsheet({
    A1: '2',
    A2: '3',
    A3: '5',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
  });

  assert.equal(sheet.B1.display, '10');
  assert.equal(sheet.B2.display, '3.3333333333333335');
});

test('recomputes dependent formulas from raw cell contents', () => {
  const first = evaluateSpreadsheet({
    A1: '10',
    A2: '=A1*2',
    A3: '=A2+5',
  });
  const second = evaluateSpreadsheet({
    A1: '7',
    A2: '=A1*2',
    A3: '=A2+5',
  });

  assert.equal(first.A3.display, '25');
  assert.equal(second.A3.display, '19');
});

test('detects circular references', () => {
  const sheet = evaluateSpreadsheet({
    A1: '=B1',
    B1: '=A1',
  });

  assert.equal(sheet.A1.display, '#CIRC!');
  assert.equal(sheet.B1.display, '#CIRC!');
});

test('shifts relative references when formulas are pasted', () => {
  assert.equal(shiftFormula('=A1+$B1+C$1+$D$1', 1, 2), '=C2+$B2+E$1+$D$1');
});
