const assert = require('assert');
const { SpreadsheetCore } = require('./spreadsheet.js');

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

test('evaluates arithmetic, functions, and dependent cells', () => {
  const sheet = new SpreadsheetCore(100, 26);
  sheet.setCell('A1', '10');
  sheet.setCell('A2', '5');
  sheet.setCell('A3', '=SUM(A1:A2)*2');
  assert.strictEqual(sheet.getDisplay('A3'), '30');
  sheet.setCell('A1', '20');
  assert.strictEqual(sheet.getDisplay('A3'), '50');
});

test('supports comparisons, booleans, IF, and concatenation', () => {
  const sheet = new SpreadsheetCore(100, 26);
  sheet.setCell('A1', '7');
  sheet.setCell('B1', '=IF(A1>=5,"Total: "&A1,"small")');
  sheet.setCell('C1', '=AND(TRUE,A1<>0)');
  assert.strictEqual(sheet.getDisplay('B1'), 'Total: 7');
  assert.strictEqual(sheet.getDisplay('C1'), 'TRUE');
});

test('detects circular references and divide-by-zero errors', () => {
  const sheet = new SpreadsheetCore(100, 26);
  sheet.setCell('A1', '=B1');
  sheet.setCell('B1', '=A1');
  sheet.setCell('C1', '=10/0');
  assert.strictEqual(sheet.getDisplay('A1'), '#CIRC!');
  assert.strictEqual(sheet.getDisplay('B1'), '#CIRC!');
  assert.strictEqual(sheet.getDisplay('C1'), '#DIV/0!');
});

test('adjusts relative references when copying formulas', () => {
  const sheet = new SpreadsheetCore(100, 26);
  sheet.setCell('A1', '2');
  sheet.setCell('B1', '=A1+$A$1');
  const adjusted = sheet.adjustFormulaForMove(sheet.getRaw('B1'), 'B1', 'C2');
  assert.strictEqual(adjusted, '=B2+$A$1');
});

test('keeps formulas pointing at inserted rows and marks deleted references', () => {
  const sheet = new SpreadsheetCore(100, 26);
  sheet.setCell('A1', '3');
  sheet.setCell('A2', '=A1*2');
  sheet.insertRow(1);
  assert.strictEqual(sheet.getRaw('A3'), '=A2*2');
  assert.strictEqual(sheet.getDisplay('A3'), '6');
  sheet.deleteRow(2);
  assert.strictEqual(sheet.getDisplay('A2'), '#REF!');
});
