const assert = require('node:assert/strict');

const {
  evaluateSheet,
  adjustFormulaForMove,
  adjustFormulaForPaste,
  applyRowInsertionToFormula,
  applyRowDeletionToFormula,
} = require('./spreadsheet.js');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack);
    process.exitCode = 1;
  }
}

run('evaluates arithmetic and functions', () => {
  const cells = {
    A1: '2',
    A2: '3',
    A3: '=A1+A2*4',
    B1: '=SUM(A1:A3)',
    B2: '=IF(B1>16, "big", "small")',
  };
  const evaluated = evaluateSheet(cells);
  assert.equal(evaluated.A3.display, '14');
  assert.equal(evaluated.B1.display, '19');
  assert.equal(evaluated.B2.display, 'big');
});

run('detects circular references', () => {
  const evaluated = evaluateSheet({
    A1: '=B1',
    B1: '=A1',
  });
  assert.equal(evaluated.A1.display, '#CIRC!');
  assert.equal(evaluated.B1.display, '#CIRC!');
});

run('adjusts relative references when formulas move', () => {
  const moved = adjustFormulaForMove('=A1+$B2&C$3&$D$4', 2, 1);
  assert.equal(moved, '=B3+$B4&D$3&$D$4');
});

run('adjusts relative references based on paste destination', () => {
  const pasted = adjustFormulaForPaste('=A1+$B2&C$3&$D$4', 0, 1, 0, 2);
  assert.equal(pasted, '=B1+$B2&D$3&$D$4');
});

run('updates formulas when inserting and deleting rows', () => {
  assert.equal(applyRowInsertionToFormula('=SUM(A1:A3)+B4', 2, 1), '=SUM(A1:A4)+B5');
  assert.equal(applyRowDeletionToFormula('=SUM(A1:A4)+B5', 2, 1), '=SUM(A1:A3)+B4');
});
