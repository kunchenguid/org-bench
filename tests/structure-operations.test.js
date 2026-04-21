const test = require('node:test');
const assert = require('node:assert/strict');

const { applyStructureOperation } = require('../src/spreadsheet-structure.js');

test('inserting a row shifts cells and rewrites dependent formulas', () => {
  const result = applyStructureOperation(
    {
      A1: '10',
      A2: '20',
      B3: '=A1+A2+A3',
    },
    { type: 'insert-row', index: 2 },
  );

  assert.deepEqual(result, {
    A1: '10',
    A3: '20',
    B4: '=A1+A3+A4',
  });
});

test('deleting a row rewrites references to deleted cells as #REF!', () => {
  const result = applyStructureOperation(
    {
      A1: '10',
      A2: '20',
      A3: '30',
      B4: '=A1+A2+A3',
    },
    { type: 'delete-row', index: 2 },
  );

  assert.deepEqual(result, {
    A1: '10',
    A2: '30',
    B3: '=A1+#REF!+A2',
  });
});

test('inserting a column preserves absolute markers while shifting references', () => {
  const result = applyStructureOperation(
    {
      A1: '5',
      B1: '6',
      C2: '=$A$1&B$1&$B1&B1',
    },
    { type: 'insert-column', index: 2 },
  );

  assert.deepEqual(result, {
    A1: '5',
    C1: '6',
    D2: '=$A$1&C$1&$C1&C1',
  });
});

test('deleting a column rewrites deleted references as #REF! and shifts the rest', () => {
  const result = applyStructureOperation(
    {
      A1: '5',
      B1: '6',
      C1: '7',
      D2: '=A1+B1+C1',
    },
    { type: 'delete-column', index: 2 },
  );

  assert.deepEqual(result, {
    A1: '5',
    B1: '7',
    C2: '=A1+#REF!+B1',
  });
});
