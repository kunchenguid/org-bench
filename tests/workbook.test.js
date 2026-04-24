const assert = require('assert');
const { Workbook, rewriteFormulaReferences } = require('../workbook.js');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('evaluates arithmetic, ranges, comparisons, IF, CONCAT, and dependency recompute', () => {
  const book = new Workbook({ rows: 10, cols: 5 });
  book.setCell('A1', '1');
  book.setCell('A2', '2');
  book.setCell('A3', '3');
  book.setCell('B1', '=A1+A2*10');
  book.setCell('B2', '=SUM(A1:A3)');
  book.setCell('B3', '=IF(B2>=6,"ok","bad")');
  book.setCell('B4', '=CONCAT("Total: ",B2)');
  book.setCell('B5', '="Total: "&B2');

  assert.strictEqual(book.getDisplay('B1'), '21');
  assert.strictEqual(book.getDisplay('B2'), '6');
  assert.strictEqual(book.getDisplay('B3'), 'ok');
  assert.strictEqual(book.getDisplay('B4'), 'Total: 6');
  assert.strictEqual(book.getDisplay('B5'), 'Total: 6');

  book.setCell('A2', '20');
  assert.strictEqual(book.getDisplay('B1'), '201');
  assert.strictEqual(book.getDisplay('B2'), '24');
  assert.strictEqual(book.getDisplay('B3'), 'ok');
});

test('renders circular references and recoverable raw formulas', () => {
  const book = new Workbook({ rows: 5, cols: 5 });
  book.setCell('A1', '=B1+1');
  book.setCell('B1', '=A1+1');

  assert.strictEqual(book.getDisplay('A1'), '#CIRC!');
  assert.strictEqual(book.getDisplay('B1'), '#CIRC!');
  assert.strictEqual(book.getCell('A1'), '=B1+1');
});

test('copy paste rewrites relative references while preserving absolute parts', () => {
  const book = new Workbook({ rows: 10, cols: 10 });
  book.setCell('A1', '5');
  book.setCell('B1', '7');
  book.setCell('C1', '=A1+$B$1+A$1+$A1');

  book.copyRange('C1:C1');
  book.pasteRange('C2');

  assert.strictEqual(book.getCell('C2'), '=A2+$B$1+A$1+$A2');
});

test('insert and delete rows rewrite formulas or produce ref errors', () => {
  const book = new Workbook({ rows: 10, cols: 5 });
  book.setCell('A1', '10');
  book.setCell('A2', '20');
  book.setCell('B3', '=A1+A2');

  book.insertRows(1, 1);
  assert.strictEqual(book.getCell('B4'), '=A1+A3');
  assert.strictEqual(book.getDisplay('B4'), '30');

  book.deleteRows(0, 1);
  assert.strictEqual(book.getCell('B3'), '=#REF!+A2');
  assert.strictEqual(book.getDisplay('B3'), '#REF!');
});

test('records undo and redo for cell edits and range paste', () => {
  const book = new Workbook({ rows: 10, cols: 5 });
  book.setCell('A1', '1');
  book.setCell('A2', '=A1+1');
  book.copyRange('A2:A2');
  book.pasteRange('B2');

  assert.strictEqual(book.getCell('B2'), '=B1+1');
  book.undo();
  assert.strictEqual(book.getCell('B2'), '');
  book.redo();
  assert.strictEqual(book.getCell('B2'), '=B1+1');
});

test('serializes and restores raw contents and selection', () => {
  const book = new Workbook({ rows: 10, cols: 5 });
  book.setCell('A1', '4');
  book.setCell('B1', '=A1*2');
  book.setSelection('B1');

  const restored = Workbook.restore(book.serialize());
  assert.strictEqual(restored.getCell('B1'), '=A1*2');
  assert.strictEqual(restored.getDisplay('B1'), '8');
  assert.deepStrictEqual(restored.getSelection(), { row: 0, col: 1 });
});

test('standalone formula rewrite handles ranges', () => {
  assert.strictEqual(rewriteFormulaReferences('=SUM(A1:B2)', 1, 2), '=SUM(C2:D3)');
});
