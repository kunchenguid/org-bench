const assert = require('node:assert/strict');

const {
  createHistoryManager,
  getHistoryShortcut,
} = require('../src/history.js');

function createRecorder() {
  const applied = [];
  return {
    applied,
    apply(change) {
      applied.push(change.type + ':' + change.id);
    },
  };
}

function test(name, fn) {
  try {
    fn();
    console.log('PASS', name);
  } catch (error) {
    console.error('FAIL', name);
    throw error;
  }
}

test('executes grouped actions and undoes and redoes in order', () => {
  const recorder = createRecorder();
  const history = createHistoryManager({ applyChange: recorder.apply });

  history.record({
    label: 'paste',
    changes: [
      { id: 'A1', next: '1', previous: '', type: 'cell' },
      { id: 'A2', next: '2', previous: '', type: 'cell' },
    ],
  });

  assert.equal(history.canUndo(), true);
  assert.equal(history.canRedo(), false);

  history.undo();
  assert.deepEqual(recorder.applied, ['cell:A2', 'cell:A1']);
  assert.equal(history.canRedo(), true);

  history.redo();
  assert.deepEqual(recorder.applied, ['cell:A2', 'cell:A1', 'cell:A1', 'cell:A2']);
});

test('drops redo stack when a new action is recorded after undo', () => {
  const history = createHistoryManager({ applyChange() {} });

  history.record({ label: 'edit', changes: [{ id: 'A1', next: '1', previous: '', type: 'cell' }] });
  history.record({ label: 'edit', changes: [{ id: 'A2', next: '2', previous: '', type: 'cell' }] });

  history.undo();
  assert.equal(history.canRedo(), true);

  history.record({ label: 'edit', changes: [{ id: 'A3', next: '3', previous: '', type: 'cell' }] });
  assert.equal(history.canRedo(), false);
});

test('keeps only the most recent fifty actions', () => {
  const history = createHistoryManager({ applyChange() {} });

  for (let index = 1; index <= 55; index += 1) {
    history.record({
      label: 'edit',
      changes: [{ id: 'A' + index, next: String(index), previous: '', type: 'cell' }],
    });
  }

  assert.equal(history.size(), 50);
  assert.equal(history.peekUndo().changes[0].id, 'A55');

  for (let index = 0; index < 50; index += 1) {
    history.undo();
  }

  assert.equal(history.canUndo(), false);
});

test('ignores empty actions', () => {
  const history = createHistoryManager({ applyChange() {} });

  history.record({ label: 'noop', changes: [] });

  assert.equal(history.size(), 0);
  assert.equal(history.canUndo(), false);
});

test('detects platform undo and redo shortcuts', () => {
  assert.equal(
    getHistoryShortcut({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }),
    'undo'
  );
  assert.equal(
    getHistoryShortcut({ key: 'Z', metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }),
    'redo'
  );
  assert.equal(
    getHistoryShortcut({ key: 'y', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }),
    'redo'
  );
  assert.equal(
    getHistoryShortcut({ key: 'z', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }),
    null
  );
});
