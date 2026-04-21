const assert = require('node:assert/strict');

const {
  SpreadsheetModel,
  shiftFormula,
  applyPaste,
} = require('../workbook.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('evaluates arithmetic, functions, comparisons, and concatenation', () => {
  const model = new SpreadsheetModel();
  model.setCell('A1', '10');
  model.setCell('A2', '5');
  model.setCell('A3', '=A1+A2*2');
  model.setCell('A4', '=SUM(A1:A3)');
  model.setCell('A5', '=A4>20');
  model.setCell('A6', '=IF(A5, "ok", "no")');
  model.setCell('A7', '="Total: "&A4');

  assert.equal(model.getDisplayValue('A3'), '20');
  assert.equal(model.getDisplayValue('A4'), '35');
  assert.equal(model.getDisplayValue('A5'), 'TRUE');
  assert.equal(model.getDisplayValue('A6'), 'ok');
  assert.equal(model.getDisplayValue('A7'), 'Total: 35');
});

test('recalculates dependents when precedents change', () => {
  const model = new SpreadsheetModel();
  model.setCell('A1', '2');
  model.setCell('B1', '=A1*3');

  assert.equal(model.getDisplayValue('B1'), '6');
  model.setCell('A1', '4');
  assert.equal(model.getDisplayValue('B1'), '12');
});

test('detects circular references', () => {
  const model = new SpreadsheetModel();
  model.setCell('A1', '=B1');
  model.setCell('B1', '=A1');

  assert.equal(model.getDisplayValue('A1'), '#CIRC!');
  assert.equal(model.getDisplayValue('B1'), '#CIRC!');
});

test('treats empty references as zero for numeric formulas', () => {
  const model = new SpreadsheetModel();
  model.setCell('A1', '=B1+5');
  assert.equal(model.getDisplayValue('A1'), '5');
});

test('shifts relative references when formulas are pasted', () => {
  assert.equal(shiftFormula('=A1+$B2+C$3+$D$4+A1:B2', 1, 2), '=C2+$B3+E$3+$D$4+C2:D3');
});

test('pasting copied formulas shifts references by source-to-target offset', () => {
  const model = new SpreadsheetModel();
  applyPaste(model, 'C2', '=$A1+B$1', { sourceSelection: { start: 'A1', end: 'A1' } });
  assert.equal(model.getRaw('C2'), '=$A2+D$1');
});

test('does not shift cell-like text inside quoted strings', () => {
  assert.equal(shiftFormula('="A1 -> "&A1', 1, 1), '="A1 -> "&B2');
});

test('shifting a reference outside the grid produces ref errors', () => {
  assert.equal(shiftFormula('=A1', -1, 0), '=#REF!');
});

test('ref error literals render as ref errors when evaluated', () => {
  const model = new SpreadsheetModel();
  model.setCell('A1', '=#REF!');
  assert.equal(model.getDisplayValue('A1'), '#REF!');
});

test('shifting an out-of-bounds range endpoint preserves ref errors', () => {
  const model = new SpreadsheetModel();
  applyPaste(model, 'A1', '=A1:B2', { sourceSelection: { start: 'B2', end: 'B2' } });
  assert.equal(model.getRaw('A1'), '=#REF!:A1');
  assert.equal(model.getDisplayValue('A1'), '#REF!');
});
