const assert = require('assert');
const { SpreadsheetModel } = require('../spreadsheet-core.js');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('evaluates arithmetic, functions, comparisons, booleans, and text concat', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '10');
  sheet.setCell('A2', '5');
  sheet.setCell('A3', '=SUM(A1:A2)*2');
  sheet.setCell('B1', '=IF(A3>=30, "Total: "&A3, "small")');
  sheet.setCell('B2', '=AND(TRUE, A1>A2, NOT(FALSE))');

  assert.strictEqual(sheet.getDisplay('A3'), '30');
  assert.strictEqual(sheet.getDisplay('B1'), 'Total: 30');
  assert.strictEqual(sheet.getDisplay('B2'), 'TRUE');
});

test('recalculates dependent formulas and detects circular references', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '1');
  sheet.setCell('A2', '=A1+1');
  assert.strictEqual(sheet.getDisplay('A2'), '2');
  sheet.setCell('A1', '8');
  assert.strictEqual(sheet.getDisplay('A2'), '9');

  sheet.setCell('C1', '=C2');
  sheet.setCell('C2', '=C1');
  assert.strictEqual(sheet.getDisplay('C1'), '#CIRC!');
  assert.strictEqual(sheet.getDisplay('C2'), '#CIRC!');
});

test('copy paste shifts relative references but preserves absolute references', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '2');
  sheet.setCell('B1', '4');
  sheet.setCell('C1', '=A1+$B$1');
  sheet.copyRange({ row: 0, col: 2 }, { row: 0, col: 2 });
  sheet.pasteAt({ row: 1, col: 2 });

  assert.strictEqual(sheet.getRaw('C2'), '=A2+$B$1');
});

test('range delete and undo restore raw contents', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '1');
  sheet.setCell('B1', '2');
  sheet.clearRange({ row: 0, col: 0 }, { row: 0, col: 1 });
  assert.strictEqual(sheet.getRaw('A1'), '');
  assert.strictEqual(sheet.getRaw('B1'), '');
  sheet.undo();
  assert.strictEqual(sheet.getRaw('A1'), '1');
  assert.strictEqual(sheet.getRaw('B1'), '2');
});

test('inserting rows keeps formulas pointing at moved data', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCell('A1', '7');
  sheet.setCell('B1', '=A1*2');
  sheet.insertRow(0);

  assert.strictEqual(sheet.getRaw('A2'), '7');
  assert.strictEqual(sheet.getRaw('B2'), '=A2*2');
  assert.strictEqual(sheet.getDisplay('B2'), '14');
});
