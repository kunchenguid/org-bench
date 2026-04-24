const assert = require('assert');
const { SpreadsheetModel, adjustFormulaReferences } = require('../spreadsheet-core.js');

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test('formulas recalculate when precedent cells change', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('A1', '2');
  sheet.setCell('A2', '3');
  sheet.setCell('A3', '=SUM(A1:A2)*2');
  assert.strictEqual(sheet.getDisplay('A3'), '10');
  sheet.setCell('A2', '8');
  assert.strictEqual(sheet.getDisplay('A3'), '20');
});

test('empty cells display blank but evaluate as zero in formulas', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('A1', '=B1+2');
  assert.strictEqual(sheet.getDisplay('B1'), '');
  assert.strictEqual(sheet.getDisplay('A1'), '2');
});

test('copying a formula shifts only relative references', () => {
  assert.strictEqual(adjustFormulaReferences('=A1+$B$2+C$3+$D4', 1, 2), '=C2+$B$2+E$3+$D5');
});

test('range clear is one undoable action', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('A1', '1');
  sheet.setCell('B1', '2');
  sheet.clearRange(0, 0, 0, 1);
  assert.strictEqual(sheet.getRaw('A1'), '');
  assert.strictEqual(sheet.getRaw('B1'), '');
  sheet.undo();
  assert.strictEqual(sheet.getRaw('A1'), '1');
  assert.strictEqual(sheet.getRaw('B1'), '2');
});

test('cut and paste moves cells as one undoable action', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('A1', '10');
  sheet.setCell('B1', '=A1*2');
  sheet.moveRange(0, 0, 0, 1, 2, 0);
  assert.strictEqual(sheet.getRaw('A1'), '');
  assert.strictEqual(sheet.getRaw('B1'), '');
  assert.strictEqual(sheet.getRaw('A3'), '10');
  assert.strictEqual(sheet.getRaw('B3'), '=A3*2');
  assert.strictEqual(sheet.getDisplay('B3'), '20');
  sheet.undo();
  assert.strictEqual(sheet.getRaw('A1'), '10');
  assert.strictEqual(sheet.getRaw('B1'), '=A1*2');
  assert.strictEqual(sheet.getRaw('A3'), '');
  assert.strictEqual(sheet.getRaw('B3'), '');
  sheet.redo();
  assert.strictEqual(sheet.getRaw('A3'), '10');
  assert.strictEqual(sheet.getRaw('B3'), '=A3*2');
});

test('pasting a smaller block into a matching selected range repeats over the target', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.pasteRange(0, 0, [['x']], null, { rows: 2, cols: 2 });
  assert.strictEqual(sheet.getRaw('A1'), 'x');
  assert.strictEqual(sheet.getRaw('B1'), 'x');
  assert.strictEqual(sheet.getRaw('A2'), 'x');
  assert.strictEqual(sheet.getRaw('B2'), 'x');
});

test('inserting a row keeps formulas pointing at moved data', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('A2', '7');
  sheet.setCell('B1', '=A2');
  sheet.insertRow(1);
  assert.strictEqual(sheet.getRaw('A3'), '7');
  assert.strictEqual(sheet.getRaw('B1'), '=A3');
  assert.strictEqual(sheet.getDisplay('B1'), '7');
});

test('deleting a column marks references to deleted cells as ref errors', () => {
  const sheet = new SpreadsheetModel({ storage: null });
  sheet.setCell('A1', '5');
  sheet.setCell('B1', '=A1');
  sheet.deleteColumn(0);
  assert.strictEqual(sheet.getRaw('A1'), '=#REF!');
  assert.strictEqual(sheet.getDisplay('A1'), '#REF!');
});

test('storage restores raw formulas and selected cell', () => {
  const storage = new Map();
  const adapter = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, value)
  };
  const first = new SpreadsheetModel({ storage: adapter, storageKey: 'test-state' });
  first.setCell('C4', '=SUM(A1:A2)');
  first.selected = { row: 3, col: 2 };
  first.save();
  const restored = new SpreadsheetModel({ storage: adapter, storageKey: 'test-state' });
  assert.strictEqual(restored.getRaw('C4'), '=SUM(A1:A2)');
  assert.deepStrictEqual(restored.selected, { row: 3, col: 2 });
});
