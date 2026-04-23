const assert = require('assert');
const { createSheet, adjustFormulaReferences } = require('./spreadsheet-core');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('evaluates arithmetic, ranges, and dependent formulas', () => {
  const sheet = createSheet(100, 26);
  sheet.setCell('A1', '10');
  sheet.setCell('A2', '5');
  sheet.setCell('A3', '=A1+A2*2');
  sheet.setCell('A4', '=SUM(A1:A3)');

  assert.strictEqual(sheet.getDisplay('A3'), '20');
  assert.strictEqual(sheet.getDisplay('A4'), '35');

  sheet.setCell('A2', '7');

  assert.strictEqual(sheet.getDisplay('A3'), '24');
  assert.strictEqual(sheet.getDisplay('A4'), '41');
});

test('supports functions, comparisons, booleans, and string concatenation', () => {
  const sheet = createSheet(100, 26);
  sheet.setCell('A1', '4');
  sheet.setCell('A2', '8');
  sheet.setCell('B1', '=IF(A2>A1,"high","low")');
  sheet.setCell('B2', '=AND(TRUE,A1<5)');
  sheet.setCell('B3', '="Total: "&SUM(A1:A2)');

  assert.strictEqual(sheet.getDisplay('B1'), 'high');
  assert.strictEqual(sheet.getDisplay('B2'), 'TRUE');
  assert.strictEqual(sheet.getDisplay('B3'), 'Total: 12');
});

test('adjusts relative references while preserving absolute components', () => {
  assert.strictEqual(
    adjustFormulaReferences('=A1+$B1+A$1+$B$1+SUM(A1:B2)', 1, 2),
    '=C2+$B2+C$1+$B$1+SUM(C2:D3)'
  );
});

test('detects circular references without crashing', () => {
  const sheet = createSheet(100, 26);
  sheet.setCell('A1', '=B1');
  sheet.setCell('B1', '=A1');

  assert.strictEqual(sheet.getDisplay('A1'), '#CIRC!');
  assert.strictEqual(sheet.getDisplay('B1'), '#CIRC!');
});
