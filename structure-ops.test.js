const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyStructureOperation,
} = require('./structure-ops.js');

test('inserting a row shifts cells down and rewrites surviving formulas', () => {
  const result = applyStructureOperation(
    {
      A1: '10',
      A2: '20',
      B2: '=SUM(A1:A2)',
      C3: '=B2',
    },
    { type: 'insert-row', index: 2, count: 1 }
  );

  assert.deepEqual(result, {
    A1: '10',
    A3: '20',
    B3: '=SUM(A1:A3)',
    C4: '=B3',
  });
});

test('deleting a row removes deleted cells, shifts survivors up, and rewrites formulas', () => {
  const result = applyStructureOperation(
    {
      A1: '10',
      A2: '20',
      A3: '30',
      B3: '=A2+A3',
      C4: '=SUM(A1:A3)',
    },
    { type: 'delete-row', index: 2, count: 1 }
  );

  assert.deepEqual(result, {
    A1: '10',
    A2: '30',
    B2: '=#REF!+A2',
    C3: '=SUM(A1:A2)',
  });
});

test('inserting a column shifts cells right and rewrites formulas', () => {
  const result = applyStructureOperation(
    {
      A1: '10',
      B1: '20',
      C1: '=A1+B1',
      D2: '=SUM(B1:C1)',
    },
    { type: 'insert-column', index: 2, count: 1 }
  );

  assert.deepEqual(result, {
    A1: '10',
    C1: '20',
    D1: '=A1+C1',
    E2: '=SUM(C1:D1)',
  });
});

test('deleting a column removes deleted cells, shifts survivors left, and rewrites formulas', () => {
  const result = applyStructureOperation(
    {
      A1: '10',
      B1: '20',
      C1: '30',
      D1: '=B1+C1',
      E2: '=SUM(A1:C1)',
    },
    { type: 'delete-column', index: 2, count: 1 }
  );

  assert.deepEqual(result, {
    A1: '10',
    B1: '30',
    C1: '=#REF!+B1',
    D2: '=SUM(A1:B1)',
  });
});
