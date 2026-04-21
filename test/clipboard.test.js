const test = require('node:test');
const assert = require('node:assert/strict');

const { serializeClipboardRows, parseClipboardText, shiftFormulaReferences } = require('../src/clipboard.js');

test('serializes a rectangular raw-value block as TSV', () => {
  assert.equal(serializeClipboardRows([
    ['1', '=A1+1'],
    ['hello', ''],
  ]), '1\t=A1+1\nhello\t');
});

test('parses tab and newline separated clipboard text', () => {
  assert.deepEqual(parseClipboardText('1\t2\n3\t4'), [
    ['1', '2'],
    ['3', '4'],
  ]);
});

test('shifts relative formulas while preserving absolute references', () => {
  assert.equal(shiftFormulaReferences('=A1+B$2+$C3+$D$4', 2, 3), '=D3+E$2+$C5+$D$4');
});

test('shifts ranges and mixed absolute references inside formulas', () => {
  assert.equal(shiftFormulaReferences('=SUM(A1:B2,$C$3:C4)', 1, 2), '=SUM(C2:D3,$C$3:E5)');
});
