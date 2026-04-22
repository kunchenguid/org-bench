const assert = require('node:assert/strict');
const {
  createSpreadsheetEngine,
  shiftFormulaReferences,
  rewriteFormulaForStructuralChange,
} = require('../src/engine');

function test(name, fn) {
  try {
    fn();
    console.log('PASS', name);
  } catch (error) {
    console.error('FAIL', name);
    throw error;
  }
}

test('stores raw cell contents and evaluates arithmetic formulas', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('A3', '=A1+A2*4');

  assert.equal(engine.getCellInput('A3'), '=A1+A2*4');
  assert.equal(engine.getDisplayValue('A3'), '14');
});

test('recalculates dependents after a precedent changes', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '10');
  engine.setCell('A2', '=A1*2');
  engine.setCell('A3', '=A2+1');

  assert.equal(engine.getDisplayValue('A3'), '21');
  engine.setCell('A1', '7');
  assert.equal(engine.getDisplayValue('A3'), '15');
});

test('supports ranges and built-in functions', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '1');
  engine.setCell('A2', '2');
  engine.setCell('A3', '3');
  engine.setCell('B1', '=SUM(A1:A3)');
  engine.setCell('B2', '=AVERAGE(A1:A3)');
  engine.setCell('B3', '=COUNT(A1:A3)');
  engine.setCell('B4', '=MAX(A1:A3)');
  engine.setCell('B5', '=MIN(A1:A3)');

  assert.equal(engine.getDisplayValue('B1'), '6');
  assert.equal(engine.getDisplayValue('B2'), '2');
  assert.equal(engine.getDisplayValue('B3'), '3');
  assert.equal(engine.getDisplayValue('B4'), '3');
  assert.equal(engine.getDisplayValue('B5'), '1');
});

test('supports boolean, comparison, and text formulas', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '5');
  engine.setCell('A2', '=IF(A1>3, "yes", "no")');
  engine.setCell('A3', '=AND(TRUE, A1>=5, NOT(FALSE))');
  engine.setCell('A4', '="Total: "&A1');

  assert.equal(engine.getDisplayValue('A2'), 'yes');
  assert.equal(engine.getDisplayValue('A3'), 'TRUE');
  assert.equal(engine.getDisplayValue('A4'), 'Total: 5');
});

test('treats empty references as zero in numeric formulas', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '=B2+5');

  assert.equal(engine.getDisplayValue('A1'), '5');
});

test('returns spreadsheet-style error markers', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '=1/0');
  engine.setCell('A2', '=NOPE(1)');
  engine.setCell('A3', '=1+');

  assert.equal(engine.getDisplayValue('A1'), '#DIV/0!');
  assert.equal(engine.getDisplayValue('A2'), '#ERR!');
  assert.equal(engine.getDisplayValue('A3'), '#ERR!');
});

test('detects circular references', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');

  assert.equal(engine.getDisplayValue('A1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
});

test('shifts relative and absolute references during copy-paste', () => {
  assert.equal(shiftFormulaReferences('=A1+$B$2+C$3+$D4', 2, 1), '=B3+$B$2+D$3+$D6');
  assert.equal(shiftFormulaReferences('=SUM(A1:B2)', 1, 2), '=SUM(C2:D3)');
});

test('rewrites formulas for inserted rows and columns', () => {
  assert.equal(
    rewriteFormulaForStructuralChange('=SUM(A1:B2)+C3', { type: 'insert-row', index: 1, count: 1 }),
    '=SUM(A1:B3)+C4'
  );
  assert.equal(
    rewriteFormulaForStructuralChange('=A1+$B2+C$3', { type: 'insert-column', index: 1, count: 1 }),
    '=A1+$C2+D$3'
  );
});

test('marks deleted references as #REF!', () => {
  assert.equal(
    rewriteFormulaForStructuralChange('=SUM(A1:B2)+C3', { type: 'delete-row', index: 1, count: 1 }),
    '=SUM(A1:B1)+C2'
  );
  assert.equal(
    rewriteFormulaForStructuralChange('=A1+B2', { type: 'delete-column', index: 0, count: 1 }),
    '=#REF!+A2'
  );
});

console.log('All tests completed.');
