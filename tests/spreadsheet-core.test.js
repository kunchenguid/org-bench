const assert = require('node:assert/strict');

const { createWorkbook, shiftFormula, adjustFormulaForStructureChange } = require('../app.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('recalculates formulas when precedent cells change', () => {
  const book = createWorkbook(26, 100);
  book.setCell('A1', '10');
  book.setCell('A2', '5');
  book.setCell('A3', '=SUM(A1:A2)*2');
  assert.equal(book.getDisplay('A3'), '30');

  book.setCell('A2', '7');
  assert.equal(book.getDisplay('A3'), '34');
});

test('detects circular references without crashing', () => {
  const book = createWorkbook(26, 100);
  book.setCell('A1', '=A2+1');
  book.setCell('A2', '=A1+1');
  assert.equal(book.getDisplay('A1'), '#CIRC!');
  assert.equal(book.getDisplay('A2'), '#CIRC!');
});

test('shifts relative references when formulas are pasted', () => {
  assert.equal(shiftFormula('=A1+$B$2+C$3+$D4+SUM(A1:B2)', 2, 1), '=B3+$B$2+D$3+$D6+SUM(B3:C4)');
});

test('supports comparison, booleans, IF, and concatenation', () => {
  const book = createWorkbook(26, 100);
  book.setCell('A1', '4');
  book.setCell('A2', '=IF(A1>=3, "ok "&TRUE, "bad")');
  assert.equal(book.getDisplay('A2'), 'ok TRUE');
});

test('updates formula references when rows are inserted above referenced data', () => {
  assert.equal(adjustFormulaForStructureChange('=SUM(A1:A2)+B$3+$C4', 'row', 0, 1), '=SUM(A2:A3)+B$3+$C5');
});
