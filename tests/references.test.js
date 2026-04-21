const assert = require('node:assert/strict');

const {
  rewriteFormulaForCopy,
  rewriteFormulaForStructuralChange,
} = require('../src/references.js');

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test('shifts relative references and preserves absolute components during copy', () => {
  const rewritten = rewriteFormulaForCopy('=A1+$B1+C$1+$D$1+SUM(A1:B2)', 'A1', 'C3');

  assert.equal(rewritten, '=C3+$B3+E$1+$D$1+SUM(C3:D4)');
});

test('updates references for inserted rows and columns while leaving strings untouched', () => {
  const rowInserted = rewriteFormulaForStructuralChange('="A1"&A1+A2+$B$2+SUM(A1:A3)', {
    kind: 'insert-row',
    index: 2,
    count: 1,
  });
  const colInserted = rewriteFormulaForStructuralChange('=A1+B1+SUM(A1:B2)', {
    kind: 'insert-column',
    index: 2,
    count: 1,
  });

  assert.equal(rowInserted, '="A1"&A1+A3+$B$3+SUM(A1:A4)');
  assert.equal(colInserted, '=A1+C1+SUM(A1:C2)');
});

test('marks deleted direct references as #REF! and shrinks affected ranges', () => {
  const rowDeleted = rewriteFormulaForStructuralChange('=A1+A2+A4+SUM(A1:A4)', {
    kind: 'delete-row',
    index: 2,
    count: 1,
  });
  const colDeleted = rewriteFormulaForStructuralChange('=A1+B1+C1+SUM(A1:C1)', {
    kind: 'delete-column',
    index: 2,
    count: 1,
  });

  assert.equal(rowDeleted, '=A1+#REF!+A3+SUM(A1:A3)');
  assert.equal(colDeleted, '=A1+#REF!+B1+SUM(A1:B1)');
});
