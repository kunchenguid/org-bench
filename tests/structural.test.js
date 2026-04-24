const assert = require('assert');
const {
  adjustFormulaForStructure,
  CellRefError,
} = require('../spreadsheet-core.js');

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

test('row insert keeps formulas pointing at the same moved cells', () => {
  assert.strictEqual(
    adjustFormulaForStructure('=SUM(A1:A3)+B$2+$C4', { type: 'insertRow', index: 2, count: 1 }),
    '=SUM(A1:A4)+B$3+$C5'
  );
});

test('column insert keeps formulas pointing at the same moved cells', () => {
  assert.strictEqual(
    adjustFormulaForStructure('=A1+$B2+SUM(C1:D4)', { type: 'insertColumn', index: 2, count: 1 }),
    '=A1+$C2+SUM(D1:E4)'
  );
});

test('deleted referenced row becomes REF error without corrupting unrelated refs', () => {
  assert.strictEqual(
    adjustFormulaForStructure('=A1+A2+A3', { type: 'deleteRow', index: 2, count: 1 }),
    '=A1+#REF!+A2'
  );
});

test('deleted referenced column becomes REF error without corrupting unrelated refs', () => {
  assert.strictEqual(
    adjustFormulaForStructure('=A1+B1+C1', { type: 'deleteColumn', index: 2, count: 1 }),
    '=A1+#REF!+B1'
  );
});

test('CellRefError is exported for evaluator REF propagation', () => {
  assert.strictEqual(new CellRefError().message, '#REF!');
});
