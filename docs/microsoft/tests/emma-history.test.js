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

  assert.deepEqual(result.snapshot, { cells: {}, active: 'A1', rangeAnchor: null });
  assert.deepEqual(result.history.future, [{ cells: { A1: '7' }, active: 'A2', rangeAnchor: null }]);
});

test('redos an undone snapshot', () => {
  let history = createHistory({ cells: {}, active: 'A1' });
  history = recordSnapshot(history, { cells: { A1: '7' }, active: 'A2' });
  const undone = undoSnapshot(history);

  const redone = redoSnapshot(undone.history);

  assert.deepEqual(redone.snapshot, { cells: { A1: '7' }, active: 'A2', rangeAnchor: null });
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
  assert.deepEqual(history.past[0], { cells: { A1: '10' }, active: 'A1', rangeAnchor: null });
});

test('preserves selection metadata in snapshots', () => {
  let history = createHistory({ cells: {}, active: 'B2', rangeAnchor: { col: 1, row: 1 } });
  history = recordSnapshot(history, { cells: { B2: '9' }, active: 'C3', rangeAnchor: { col: 2, row: 2 } });

  const undone = undoSnapshot(history);

  assert.deepEqual(undone.snapshot, { cells: {}, active: 'B2', rangeAnchor: { col: 1, row: 1 } });
});
