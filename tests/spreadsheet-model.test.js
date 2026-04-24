const assert = require('assert');
const { SpreadsheetModel, adjustFormulaReferences } = require('../spreadsheet-core.js');

function test(name, fn) { fn(); console.log(`ok - ${name}`); }

test('formulas recalculate when precedent cells change', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('A1', '2'); sheet.setCell('A2', '3'); sheet.setCell('A3', '=SUM(A1:A2)*2');
  assert.strictEqual(sheet.getDisplay('A3'), '10');
  sheet.setCell('A2', '8');
  assert.strictEqual(sheet.getDisplay('A3'), '20');
});

test('empty cells display blank but evaluate as zero in formulas', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('B1', '=A1+4');
  assert.strictEqual(sheet.getDisplay('A1'), '');
  assert.strictEqual(sheet.getDisplay('B1'), '4');
});

test('copying a formula shifts only relative references', () => {
  assert.strictEqual(adjustFormulaReferences('=A1+$B$2+C$3+$D4', 1, 2), '=C2+$B$2+E$3+$D5');
});

test('supports IF, comparisons, booleans, and string concatenation', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('B1', '4');
  sheet.setCell('B2', '=IF(B1>=4,"ok "&TRUE,"bad")');
  assert.strictEqual(sheet.getDisplay('B2'), 'ok TRUE');
});

test('circular references render as clear errors', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('C1', '=C2+1');
  sheet.setCell('C2', '=C1+1');
  assert.strictEqual(sheet.getDisplay('C1'), '#CIRC!');
  assert.strictEqual(sheet.getDisplay('C2'), '#CIRC!');
});

test('range clear is one undoable action', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('A1', '1'); sheet.setCell('B1', '2'); sheet.clearRange(0, 0, 0, 1);
  assert.strictEqual(sheet.getRaw('A1'), ''); assert.strictEqual(sheet.getRaw('B1'), '');
  sheet.undo();
  assert.strictEqual(sheet.getRaw('A1'), '1'); assert.strictEqual(sheet.getRaw('B1'), '2');
});

test('inserting a row keeps formulas pointing at moved data', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('A2', '7'); sheet.setCell('B1', '=A2'); sheet.insertRow(1);
  assert.strictEqual(sheet.getRaw('A3'), '7');
  assert.strictEqual(sheet.getRaw('B1'), '=A3');
  assert.strictEqual(sheet.getDisplay('B1'), '7');
});

test('deleting a referenced column marks formulas as ref errors', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('A1', '7'); sheet.setCell('B1', '=A1'); sheet.deleteColumn(0);
  assert.strictEqual(sheet.getRaw('A1'), '=#REF!');
  assert.strictEqual(sheet.getDisplay('A1'), '#REF!');
});
