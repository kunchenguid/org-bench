const assert = require('assert');
const sheet = require('./spreadsheet.js');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('not ok - ' + name);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('evaluates arithmetic, ranges, comparisons, booleans, and strings', () => {
  const cells = {
    A1: '10',
    A2: '5',
    A3: '=SUM(A1:A2)',
    B1: '=A3*2+ROUND(2.4,0)',
    B2: '=IF(B1>=32,"ok","bad")',
    B3: '="Total: "&B1',
    C1: '=AND(TRUE,B1=32,NOT(FALSE))',
  };
  assert.strictEqual(sheet.evaluateCell(cells, 'A3'), 15);
  assert.strictEqual(sheet.evaluateCell(cells, 'B1'), 32);
  assert.strictEqual(sheet.evaluateCell(cells, 'B2'), 'ok');
  assert.strictEqual(sheet.evaluateCell(cells, 'B3'), 'Total: 32');
  assert.strictEqual(sheet.formatValue(sheet.evaluateCell(cells, 'C1')), 'TRUE');
});

test('detects circular references and formula errors', () => {
  assert.strictEqual(sheet.formatValue(sheet.evaluateCell({ A1: '=A2', A2: '=A1' }, 'A1')), '#CIRC!');
  assert.strictEqual(sheet.formatValue(sheet.evaluateCell({ A1: '=1/0' }, 'A1')), '#DIV/0!');
  assert.strictEqual(sheet.formatValue(sheet.evaluateCell({ A1: '=NOPE(1)' }, 'A1')), '#ERR!');
});

test('adjusts relative and absolute references on copy paste', () => {
  assert.strictEqual(sheet.adjustFormula('=A1+$A1+A$1+$A$1+SUM(B1:C2)', 2, 1), '=B3+$A3+B$1+$A$1+SUM(C3:D4)');
});

test('updates references across inserted and deleted rows and columns', () => {
  assert.strictEqual(sheet.transformFormula('=SUM(A1:A3)+B2', { type: 'insertRow', index: 2, count: 1 }), '=SUM(A1:A4)+B3');
  assert.strictEqual(sheet.transformFormula('=SUM(A1:C1)+C2', { type: 'deleteCol', index: 2, count: 1 }), '=SUM(A1:B1)+B2');
  assert.strictEqual(sheet.transformFormula('=B2+C2', { type: 'deleteCol', index: 2, count: 1 }), '=#REF!+B2');
});

if (process.exitCode) process.exit(process.exitCode);
