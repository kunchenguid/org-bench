const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyStructuralEdit,
  rewriteFormulaForStructuralEdit,
} = require('./structure.js');

test('inserting a row shifts row references below the insertion point, including absolute ones', () => {
  assert.equal(
    rewriteFormulaForStructuralEdit('=A1+B3+$C$4+C$5+$D6', {
      type: 'insert-row',
      index: 2,
    }),
    '=A1+B4+$C$5+C$6+$D7'
  );
});

test('deleting a row preserves references above and marks deleted targets as #REF!', () => {
  assert.equal(
    rewriteFormulaForStructuralEdit('=SUM(A1:A4)+B2+C3', {
      type: 'delete-row',
      index: 2,
    }),
    '=SUM(A1:A3)+#REF!+C2'
  );
});

test('inserting a column shifts column references that move with the data, including absolute ones', () => {
  assert.equal(
    rewriteFormulaForStructuralEdit('=A1+B2+$C3+D$4', {
      type: 'insert-column',
      index: 2,
    }),
    '=A1+C2+$D3+E$4'
  );
});

test('deleting a column rewrites ranges and deleted references', () => {
  assert.equal(
    rewriteFormulaForStructuralEdit('=SUM(A1:C2)+B5+D6', {
      type: 'delete-column',
      index: 2,
    }),
    '=SUM(A1:B2)+#REF!+C6'
  );
});

test('applying a row insertion moves cells and rewrites formulas to keep pointing at the same data', () => {
  const next = applyStructuralEdit(
    {
      A1: '10',
      A2: '20',
      B1: '=A2',
      B2: '=SUM(A1:A2)',
    },
    { type: 'insert-row', index: 2 }
  );

  assert.deepEqual(next, {
    A1: '10',
    A3: '20',
    B1: '=A3',
    B3: '=SUM(A1:A3)',
  });
});

test('applying a column deletion moves cells left and leaves broken references as #REF!', () => {
  const next = applyStructuralEdit(
    {
      A1: '7',
      B1: '9',
      C1: '=B1',
      D1: '=SUM(A1:C1)',
    },
    { type: 'delete-column', index: 2 }
  );

  assert.deepEqual(next, {
    A1: '7',
    B1: '=#REF!',
    C1: '=SUM(A1:B1)',
  });
});
