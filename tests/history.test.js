const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createHistory,
  recordAction,
  undo,
  redo,
} = require('../src/history.js');

test('undos the most recent action and exposes it for redo', () => {
  const history = createHistory();

  recordAction(history, { before: { A1: '' }, after: { A1: '1' } });
  const undone = undo(history);

  assert.deepEqual(undone.before, { A1: '' });
  assert.deepEqual(redo(history).after, { A1: '1' });
});

test('clears redo history after a new action', () => {
  const history = createHistory();

  recordAction(history, { before: { A1: '' }, after: { A1: '1' } });
  undo(history);
  recordAction(history, { before: { B1: '' }, after: { B1: '2' } });

  assert.equal(redo(history), null);
});

test('keeps only the most recent configured number of actions', () => {
  const history = createHistory(2);

  recordAction(history, { before: { A1: '' }, after: { A1: '1' } });
  recordAction(history, { before: { A2: '' }, after: { A2: '2' } });
  recordAction(history, { before: { A3: '' }, after: { A3: '3' } });

  assert.deepEqual(undo(history).after, { A3: '3' });
  assert.deepEqual(undo(history).after, { A2: '2' });
  assert.equal(undo(history), null);
});
