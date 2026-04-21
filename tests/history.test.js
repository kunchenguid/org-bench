const test = require('node:test');
const assert = require('node:assert/strict');

const { createHistory, recordAction, undoAction, redoAction } = require('../history.js');

test('records a single user action and clears redo when state changes', () => {
  const history = createHistory(3);
  recordAction(history, { cells: { A1: '1' } }, { cells: { A1: '2' } }, 'commit');
  history.redo.push({ before: {}, after: {}, label: 'stale' });
  recordAction(history, { cells: { A1: '2' } }, { cells: { A1: '3' } }, 'paste');

  assert.deepEqual(history.undo.map(function (entry) { return entry.label; }), ['commit', 'paste']);
  assert.equal(history.redo.length, 0);
});

test('ignores no-op actions', () => {
  const history = createHistory(3);
  recordAction(history, { cells: { A1: '1' } }, { cells: { A1: '1' } }, 'clear');
  assert.equal(history.undo.length, 0);
});

test('keeps only the latest fifty actions', () => {
  const history = createHistory(50);
  for (let index = 0; index < 55; index += 1) {
    recordAction(history, { cells: { A1: String(index) } }, { cells: { A1: String(index + 1) } }, 'commit-' + index);
  }

  assert.equal(history.undo.length, 50);
  assert.equal(history.undo[0].label, 'commit-5');
  assert.equal(history.undo[49].label, 'commit-54');
});

test('undo and redo round-trip a named action', () => {
  const history = createHistory(5);
  const before = { cells: { A1: '=A2' }, selection: { row: 0, col: 0 } };
  const after = { cells: { A1: '=B2' }, selection: { row: 0, col: 1 } };
  recordAction(history, before, after, 'cut');

  const undone = undoAction(history, after);
  assert.equal(undone.label, 'cut');
  assert.deepEqual(undone.state, before);

  const redone = redoAction(history, before);
  assert.equal(redone.label, 'cut');
  assert.deepEqual(redone.state, after);
});
