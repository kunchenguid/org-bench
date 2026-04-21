const test = require('node:test');
const assert = require('node:assert/strict');

const {
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  adjustSelection,
} = require('../src/structural-edits.js');

test('insertRow moves cells down and retargets references to shifted data', () => {
  const next = insertRow(
    {
      A1: '10',
      A2: '20',
      B1: '=A2',
      C1: '=SUM(A1:A2)',
    },
    2,
  );

  assert.deepEqual(next, {
    A1: '10',
    A3: '20',
    B1: '=A3',
    C1: '=SUM(A1:A3)',
  });
});

test('deleteRow removes deleted-cell references and shifts later rows up', () => {
  const next = deleteRow(
    {
      A1: '10',
      A2: '20',
      A3: '30',
      B1: '=A2',
      B3: '=A3',
      C1: '=SUM(A1:A3)',
    },
    2,
  );

  assert.deepEqual(next, {
    A1: '10',
    A2: '30',
    B1: '=#REF!',
    B2: '=A2',
    C1: '=SUM(A1:A2)',
  });
});

test('deleteRow collapses a deleted range endpoint onto the remaining shifted data', () => {
  const next = deleteRow(
    {
      C1: '=SUM(A2:A4)',
    },
    2,
  );

  assert.deepEqual(next, {
    C1: '=SUM(A2:A3)',
  });
});

test('insertColumn moves cells right and retargets formulas', () => {
  const next = insertColumn(
    {
      A1: '10',
      B1: '20',
      C1: '=B1',
      D1: '=SUM(A1:B1)',
    },
    2,
  );

  assert.deepEqual(next, {
    A1: '10',
    C1: '20',
    D1: '=C1',
    E1: '=SUM(A1:C1)',
  });
});

test('deleteColumn marks deleted references as #REF! and shifts later columns left', () => {
  const next = deleteColumn(
    {
      A1: '10',
      B1: '20',
      C1: '30',
      D1: '=B1',
      E1: '=C1',
      F1: '=SUM(A1:C1)',
    },
    2,
  );

  assert.deepEqual(next, {
    A1: '10',
    B1: '30',
    C1: '=#REF!',
    D1: '=B1',
    E1: '=SUM(A1:B1)',
  });
});

test('adjustSelection shifts the active range when inserting a row above it', () => {
  const next = adjustSelection(
    {
      start: { row: 4, col: 2 },
      end: { row: 6, col: 3 },
      active: { row: 5, col: 3 },
    },
    {
      type: 'insert-row',
      index: 4,
      maxRows: 100,
      maxCols: 26,
    },
  );

  assert.deepEqual(next, {
    start: { row: 5, col: 2 },
    end: { row: 7, col: 3 },
    active: { row: 6, col: 3 },
  });
});

test('adjustSelection keeps focus in bounds after deleting its active column', () => {
  const next = adjustSelection(
    {
      start: { row: 2, col: 3 },
      end: { row: 4, col: 5 },
      active: { row: 3, col: 3 },
    },
    {
      type: 'delete-column',
      index: 3,
      maxRows: 100,
      maxCols: 26,
    },
  );

  assert.deepEqual(next, {
    start: { row: 2, col: 3 },
    end: { row: 4, col: 4 },
    active: { row: 3, col: 3 },
  });
});
