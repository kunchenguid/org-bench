const assert = require('assert');
const { SpreadsheetModel, adjustFormulaReferences } = require('./spreadsheet-core');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('evaluates formulas and recalculates dependents', () => {
  const sheet = new SpreadsheetModel(100, 26);
  sheet.setCell('A1', '2');
  sheet.setCell('A2', '3');
  sheet.setCell('B1', '=A1+A2');
  assert.strictEqual(sheet.getDisplay('B1'), '5');
  sheet.setCell('A1', '10');
  assert.strictEqual(sheet.getDisplay('B1'), '13');
});

test('supports ranges, booleans, comparisons, and text concatenation', () => {
  const sheet = new SpreadsheetModel(100, 26);
  sheet.setCell('A1', '1');
  sheet.setCell('A2', '2');
  sheet.setCell('A3', '3');
  sheet.setCell('B1', '=SUM(A1:A3)');
  sheet.setCell('B2', '=IF(B1>=6,"Total: "&B1,"No")');
  assert.strictEqual(sheet.getDisplay('B1'), '6');
  assert.strictEqual(sheet.getDisplay('B2'), 'Total: 6');
});

test('detects circular references without crashing', () => {
  const sheet = new SpreadsheetModel(100, 26);
  sheet.setCell('A1', '=B1');
  sheet.setCell('B1', '=A1');
  assert.strictEqual(sheet.getDisplay('A1'), '#CIRC!');
});

test('adjusts relative formula references when pasted', () => {
  assert.strictEqual(adjustFormulaReferences('=A1+$B$2+C$3+$D4+SUM(A1:B2)', 2, 1), '=B3+$B$2+D$3+$D6+SUM(B3:C4)');
});

test('insert row keeps formulas pointing at the same data', () => {
  const sheet = new SpreadsheetModel(100, 26);
  sheet.setCell('A2', '4');
  sheet.setCell('A3', '=A2*2');
  sheet.insertRow(1);
  assert.strictEqual(sheet.getRaw('A4'), '=A3*2');
  assert.strictEqual(sheet.getDisplay('A4'), '8');
});
