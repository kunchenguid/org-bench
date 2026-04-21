const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createHistory,
  recordSnapshot,
  undoSnapshot,
  redoSnapshot,
} = require('../emma-history.js');

test('records snapshots and undoes to the previous state', () => {
  let history = createHistory({ cells: {}, active: 'A1' });
  history = recordSnapshot(history, { cells: { A1: '7' }, active: 'A2' });

  const result = undoSnapshot(history);

  assert.deepEqual(result.snapshot, { cells: {}, active: 'A1' });
  assert.deepEqual(result.history.future, [{ cells: { A1: '7' }, active: 'A2' }]);
});

test('redos an undone snapshot', () => {
  let history = createHistory({ cells: {}, active: 'A1' });
  history = recordSnapshot(history, { cells: { A1: '7' }, active: 'A2' });
  const undone = undoSnapshot(history);

  const redone = redoSnapshot(undone.history);

  assert.deepEqual(redone.snapshot, { cells: { A1: '7' }, active: 'A2' });
});

test('drops redo history after a new snapshot is recorded', () => {
  let history = createHistory({ cells: {}, active: 'A1' });
  history = recordSnapshot(history, { cells: { A1: '7' }, active: 'A2' });
  const undone = undoSnapshot(history);
  const replay = recordSnapshot(undone.history, { cells: { B1: '9' }, active: 'B1' });

  assert.deepEqual(replay.future, []);
});

test('caps history at fifty prior snapshots', () => {
  let history = createHistory({ cells: {}, active: 'A1' });
  for (let index = 1; index <= 60; index += 1) {
    history = recordSnapshot(history, { cells: { A1: String(index) }, active: 'A1' });
  }

  assert.equal(history.past.length, 50);
  assert.deepEqual(history.past[0], { cells: { A1: '10' }, active: 'A1' });
});
