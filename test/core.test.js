const test = require('node:test');
const assert = require('node:assert/strict');

const {
  copyRange,
  evaluateSpreadsheet,
  pasteRange,
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

test('copies a rectangular range as tab-separated raw contents', () => {
  const copied = copyRange(
    {
      A1: '2',
      B1: '=A1*3',
      A2: 'hello',
      B2: '=CONCAT(A2," world")',
    },
    { minRow: 0, maxRow: 1, minCol: 0, maxCol: 1 }
  );

  assert.equal(copied, '2\t=A1*3\nhello\t=CONCAT(A2," world")');
});

test('pastes a rectangular range and shifts relative formulas from the source origin', () => {
  const next = pasteRange(
    {},
    { row: 2, col: 2 },
    '2\t=A1+B1\n3\t=$A1+A$1',
    { minRow: 0, maxRow: 1, minCol: 0, maxCol: 1 }
  );

  assert.deepEqual(next, {
    C3: '2',
    D3: '=C3+D3',
    C4: '3',
    D4: '=$A3+C$1',
  });
});

test('copy-paste keeps the original source anchor for relative references', () => {
  const next = pasteRange(
    {},
    { row: 4, col: 4 },
    '=B2+C2\n=$B2+C$2',
    { minRow: 1, maxRow: 2, minCol: 1, maxCol: 2 }
  );

  assert.deepEqual(next, {
    E5: '=E5+F5',
    E6: '=$B5+F$2',
  });
});

test('cut-paste moves source contents and clears the original range', () => {
  const copied = copyRange(
    {
      A1: '7',
      B1: '=A1*2',
    },
    { minRow: 0, maxRow: 0, minCol: 0, maxCol: 1 }
  );
  const next = pasteRange(
    {
      A1: '7',
      B1: '=A1*2',
    },
    { row: 1, col: 0 },
    copied,
    { minRow: 0, maxRow: 0, minCol: 0, maxCol: 1 },
    true
  );

  assert.deepEqual(next, {
    A2: '7',
    B2: '=A2*2',
  });
});
