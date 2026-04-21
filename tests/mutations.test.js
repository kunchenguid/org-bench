const test = require('node:test');
const assert = require('node:assert/strict');

const { applyStructuralChange } = require('../src/mutations');

test('inserting a row shifts cells and rebases formula references to moved data', () => {
  const state = {
    cells: {
      A1: { raw: '10' },
      A2: { raw: '20' },
      B2: { raw: '=SUM(A1:A2)' },
      C3: { raw: '=A2' },
    },
  };

  const result = applyStructuralChange(state, {
    kind: 'insert-rows',
    index: 2,
    count: 1,
  });

  assert.deepEqual(result.state.cells, {
    A1: { raw: '10' },
    A3: { raw: '20' },
    B3: { raw: '=SUM(A1:A3)' },
    C4: { raw: '=A3' },
  });
  assert.deepEqual(result.undo, {
    kind: 'delete-rows',
    index: 2,
    count: 1,
  });
});

test('deleting a row produces #REF! for references into the deleted row', () => {
  const state = {
    cells: {
      A1: { raw: '10' },
      A2: { raw: '20' },
      B3: { raw: '=A1+A2' },
      C4: { raw: '=SUM(A1:A3)' },
    },
  };

  const result = applyStructuralChange(state, {
    kind: 'delete-rows',
    index: 2,
    count: 1,
  });

  assert.deepEqual(result.state.cells, {
    A1: { raw: '10' },
    B2: { raw: '=A1+#REF!' },
    C3: { raw: '=SUM(A1:A2)' },
  });
  assert.deepEqual(result.undo, {
    kind: 'insert-rows',
    index: 2,
    count: 1,
    snapshot: {
      A2: { raw: '20' },
    },
  });
});

test('inserting a column rebases ranges and preserves absolute row markers', () => {
  const state = {
    cells: {
      A1: { raw: '1' },
      B1: { raw: '2' },
      C2: { raw: '=SUM($A1:B$1)' },
    },
  };

  const result = applyStructuralChange(state, {
    kind: 'insert-columns',
    index: 2,
    count: 1,
  });

  assert.deepEqual(result.state.cells, {
    A1: { raw: '1' },
    C1: { raw: '2' },
    D2: { raw: '=SUM($A1:C$1)' },
  });
  assert.deepEqual(result.undo, {
    kind: 'delete-columns',
    index: 2,
    count: 1,
  });
});

test('deleting a column invalidates only deleted targets and keeps survivors aligned', () => {
  const state = {
    cells: {
      A1: { raw: '1' },
      B1: { raw: '2' },
      D4: { raw: '=A1+B1+C1' },
    },
  };

  const result = applyStructuralChange(state, {
    kind: 'delete-columns',
    index: 2,
    count: 1,
  });

  assert.deepEqual(result.state.cells, {
    A1: { raw: '1' },
    C4: { raw: '=A1+#REF!+B1' },
  });
  assert.deepEqual(result.undo, {
    kind: 'insert-columns',
    index: 2,
    count: 1,
    snapshot: {
      B1: { raw: '2' },
    },
  });
});
