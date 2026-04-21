const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HistoryManager,
  createCommitAction,
  createPasteAction,
  createCutAction,
  createClearAction,
  createInsertRowAction,
  createDeleteRowAction,
  createInsertColumnAction,
  createDeleteColumnAction,
} = require('./history.js');

test('records actions and replays undo then redo through applyAction', () => {
  const applied = [];
  const history = new HistoryManager({
    applyAction(action, direction) {
      applied.push({ action, direction });
    },
  });
  const action = createCommitAction({
    before: [{ row: 0, col: 0, raw: '' }],
    after: [{ row: 0, col: 0, raw: '42' }],
    selectionBefore: { row: 0, col: 0 },
    selectionAfter: { row: 1, col: 0 },
  });

  history.record(action);

  assert.equal(history.canUndo(), true);
  assert.equal(history.canRedo(), false);
  assert.equal(history.undo(), true);
  assert.deepEqual(applied[0], { action, direction: 'undo' });
  assert.equal(history.canRedo(), true);
  assert.equal(history.redo(), true);
  assert.deepEqual(applied[1], { action, direction: 'redo' });
});

test('clears redo stack when a new action is recorded after undo', () => {
  const history = new HistoryManager({ applyAction() {} });
  const first = createCommitAction({
    before: [{ row: 0, col: 0, raw: '' }],
    after: [{ row: 0, col: 0, raw: '1' }],
  });
  const second = createCommitAction({
    before: [{ row: 0, col: 1, raw: '' }],
    after: [{ row: 0, col: 1, raw: '2' }],
  });

  history.record(first);
  history.undo();
  assert.equal(history.canRedo(), true);

  history.record(second);
  assert.equal(history.canRedo(), false);
});

test('keeps only the most recent configured number of actions', () => {
  const history = new HistoryManager({ limit: 3, applyAction() {} });

  history.record(createCommitAction({ before: [], after: [{ row: 0, col: 0, raw: '1' }] }));
  history.record(createCommitAction({ before: [], after: [{ row: 0, col: 1, raw: '2' }] }));
  history.record(createCommitAction({ before: [], after: [{ row: 0, col: 2, raw: '3' }] }));
  history.record(createCommitAction({ before: [], after: [{ row: 0, col: 3, raw: '4' }] }));

  assert.equal(history.snapshot().undoStack.length, 3);
  assert.deepEqual(history.snapshot().undoStack.map((action) => action.changes[0].after.col), [1, 2, 3]);
});

test('handles undo and redo keyboard shortcuts across platforms', () => {
  const applied = [];
  const history = new HistoryManager({
    applyAction(action, direction) {
      applied.push({ action, direction });
    },
  });
  history.record(createCommitAction({ before: [], after: [{ row: 0, col: 0, raw: '1' }] }));

  const undoEvent = fakeKeyboardEvent({ key: 'z', metaKey: true });
  assert.equal(history.handleKeydown(undoEvent), true);
  assert.equal(undoEvent.prevented, true);
  assert.deepEqual(applied[0].direction, 'undo');

  const redoEvent = fakeKeyboardEvent({ key: 'z', ctrlKey: true, shiftKey: true });
  assert.equal(history.handleKeydown(redoEvent), true);
  assert.equal(redoEvent.prevented, true);
  assert.deepEqual(applied[1].direction, 'redo');

  history.record(createCommitAction({ before: [], after: [{ row: 0, col: 1, raw: '2' }] }));
  history.undo();

  const redoYEvent = fakeKeyboardEvent({ key: 'y', ctrlKey: true });
  assert.equal(history.handleKeydown(redoYEvent), true);
  assert.equal(redoYEvent.prevented, true);
  assert.deepEqual(applied[3].direction, 'redo');
});

test('ignores shortcuts when there is no matching history operation', () => {
  const history = new HistoryManager({ applyAction() {} });
  const event = fakeKeyboardEvent({ key: 'z', ctrlKey: true });

  assert.equal(history.handleKeydown(event), false);
  assert.equal(event.prevented, false);
});

test('builds normalized action payloads for supported spreadsheet operations', () => {
  const selection = { start: { row: 1, col: 1 }, end: { row: 2, col: 2 }, active: { row: 1, col: 1 } };

  assert.deepEqual(createCommitAction({ before: [], after: [], selectionBefore: null, selectionAfter: null }), {
    type: 'commit',
    changes: [],
    selectionBefore: null,
    selectionAfter: null,
  });
  assert.deepEqual(createPasteAction({ before: [], after: [], source: selection, destination: selection }), {
    type: 'paste',
    changes: [],
    source: selection,
    destination: selection,
  });
  assert.deepEqual(createCutAction({ before: [], after: [], source: selection, destination: selection }), {
    type: 'cut',
    changes: [],
    source: selection,
    destination: selection,
  });
  assert.deepEqual(createClearAction({ before: [], after: [], selection }), {
    type: 'clear',
    changes: [],
    selection,
  });
  assert.deepEqual(createInsertRowAction({ index: 3, count: 1, before: [], after: [] }), {
    type: 'insert-row',
    index: 3,
    count: 1,
    before: [],
    after: [],
  });
  assert.deepEqual(createDeleteRowAction({ index: 3, count: 1, before: [], after: [] }), {
    type: 'delete-row',
    index: 3,
    count: 1,
    before: [],
    after: [],
  });
  assert.deepEqual(createInsertColumnAction({ index: 2, count: 1, before: [], after: [] }), {
    type: 'insert-column',
    index: 2,
    count: 1,
    before: [],
    after: [],
  });
  assert.deepEqual(createDeleteColumnAction({ index: 2, count: 1, before: [], after: [] }), {
    type: 'delete-column',
    index: 2,
    count: 1,
    before: [],
    after: [],
  });
});

function fakeKeyboardEvent({ key, ctrlKey = false, metaKey = false, shiftKey = false }) {
  return {
    key,
    ctrlKey,
    metaKey,
    shiftKey,
    defaultPrevented: false,
    prevented: false,
    preventDefault() {
      this.defaultPrevented = true;
      this.prevented = true;
    },
  };
}
