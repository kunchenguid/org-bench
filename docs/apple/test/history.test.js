const test = require('node:test');
const assert = require('node:assert/strict');

const { createHistory } = require('../src/history.js');

test('commit stores a single undo step per committed user action', () => {
  const history = createHistory({
    initialState: { cells: {}, selection: { row: 1, col: 1 } },
    limit: 50,
  });

  history.commit({ cells: { A1: '42' }, selection: { row: 2, col: 1 } });

  assert.deepEqual(history.getState(), {
    cells: { A1: '42' },
    selection: { row: 2, col: 1 },
  });
  assert.equal(history.canUndo(), true);
  assert.equal(history.canRedo(), false);

  const undone = history.undo();
  assert.deepEqual(undone, { cells: {}, selection: { row: 1, col: 1 } });
  assert.deepEqual(history.getState(), { cells: {}, selection: { row: 1, col: 1 } });

  const redone = history.redo();
  assert.deepEqual(redone, { cells: { A1: '42' }, selection: { row: 2, col: 1 } });
  assert.deepEqual(history.getState(), { cells: { A1: '42' }, selection: { row: 2, col: 1 } });
});

test('commit ignores unchanged states and clears redo after a new action', () => {
  const history = createHistory({
    initialState: { cells: { A1: '1' }, selection: { row: 1, col: 1 } },
    limit: 50,
  });

  history.commit({ cells: { A1: '1' }, selection: { row: 1, col: 1 } });
  assert.equal(history.canUndo(), false);

  history.commit({ cells: { A1: '2' }, selection: { row: 1, col: 1 } });
  history.undo();
  assert.equal(history.canRedo(), true);

  history.commit({ cells: { A1: '3' }, selection: { row: 1, col: 1 } });
  assert.equal(history.canRedo(), false);
});

test('history keeps only the most recent 50 undo states', () => {
  const history = createHistory({
    initialState: { cells: {}, selection: { row: 1, col: 1 } },
    limit: 50,
  });

  for (let index = 1; index <= 55; index += 1) {
    history.commit({
      cells: { A1: String(index) },
      selection: { row: index, col: 1 },
    });
  }

  for (let index = 0; index < 50; index += 1) {
    history.undo();
  }

  assert.deepEqual(history.getState(), {
    cells: { A1: '5' },
    selection: { row: 5, col: 1 },
  });
  assert.equal(history.canUndo(), false);
});
