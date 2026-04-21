const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createHistory,
  recordHistory,
  undoHistory,
  redoHistory,
} = require('../src/history.js');

test('undo restores the previous committed sheet snapshot', () => {
  const history = createHistory();

  recordHistory(history, { cells: {}, selection: { row: 0, col: 0 } });
  recordHistory(history, { cells: { A1: '7' }, selection: { row: 1, col: 0 } });

  const result = undoHistory(history);

  assert.deepEqual(result, { cells: {}, selection: { row: 0, col: 0 } });
});

test('redo reapplies the undone committed sheet snapshot', () => {
  const history = createHistory();

  recordHistory(history, { cells: {}, selection: { row: 0, col: 0 } });
  recordHistory(history, { cells: { A1: '7' }, selection: { row: 1, col: 0 } });
  undoHistory(history);

  const result = redoHistory(history);

  assert.deepEqual(result, { cells: { A1: '7' }, selection: { row: 1, col: 0 } });
});

test('recording a new action after undo clears the redo stack', () => {
  const history = createHistory();

  recordHistory(history, { cells: {}, selection: { row: 0, col: 0 } });
  recordHistory(history, { cells: { A1: '7' }, selection: { row: 1, col: 0 } });
  undoHistory(history);
  recordHistory(history, { cells: { B1: '9' }, selection: { row: 0, col: 1 } });

  assert.equal(redoHistory(history), null);
});
