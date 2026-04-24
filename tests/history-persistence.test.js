const assert = require('assert');
const {
  createHistory,
  createPersistence,
  installUndoRedoShortcuts,
} = require('../history-persistence.js');

function createMemoryStorage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return Array.from(data.keys())[index] || null;
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };
}

function testHistoryRetainsLastFiftyActions() {
  const applied = [];
  const history = createHistory({
    limit: 50,
    onApply(state) {
      applied.push(state.selection.active);
    },
  });

  for (let index = 0; index < 55; index += 1) {
    history.record({
      before: { cells: { A1: String(index) }, selection: { active: `A${index + 1}` } },
      after: { cells: { A1: String(index + 1) }, selection: { active: `A${index + 2}` } },
    });
  }

  assert.strictEqual(history.undoDepth(), 50);
  assert.strictEqual(history.redoDepth(), 0);

  for (let index = 0; index < 50; index += 1) {
    assert.strictEqual(history.undo(), true);
  }

  assert.strictEqual(history.undo(), false);
  assert.strictEqual(applied[0], 'A55');
  assert.strictEqual(applied[49], 'A6');
  assert.strictEqual(history.redoDepth(), 50);
}

function testRedoIsClearedAfterNewUserAction() {
  const applied = [];
  const history = createHistory({ onApply: (state) => applied.push(state) });

  history.record({
    before: { cells: {}, selection: { active: 'A1' } },
    after: { cells: { A1: '1' }, selection: { active: 'A1' } },
  });
  assert.strictEqual(history.undo(), true);
  assert.strictEqual(history.redoDepth(), 1);

  history.record({
    before: { cells: {}, selection: { active: 'A1' } },
    after: { cells: { B1: '2' }, selection: { active: 'B1' } },
  });

  assert.strictEqual(history.redoDepth(), 0);
  assert.strictEqual(history.redo(), false);
  assert.deepStrictEqual(applied[0], { cells: {}, selection: { active: 'A1' } });
}

function testPersistenceUsesNamespaceAndRestoresRawCellsAndSelection() {
  const storage = createMemoryStorage();
  const persistence = createPersistence({
    namespace: 'run-apple-42:',
    storage,
  });
  const state = {
    cells: {
      A1: '=SUM(B1:B3)',
      B1: '1',
      C1: 'plain text',
    },
    selection: {
      active: 'C1',
      anchor: 'B1',
      focus: 'C3',
    },
  };

  persistence.save(state);

  assert.strictEqual(storage.getItem('cells'), null);
  assert.strictEqual(storage.getItem('selection'), null);
  assert.ok(storage.getItem('run-apple-42:cells'));
  assert.ok(storage.getItem('run-apple-42:selection'));
  assert.deepStrictEqual(persistence.restore(), state);
}

function createKeyboardTarget() {
  const handlers = new Set();
  return {
    addEventListener(type, handler) {
      assert.strictEqual(type, 'keydown');
      handlers.add(handler);
    },
    removeEventListener(type, handler) {
      assert.strictEqual(type, 'keydown');
      handlers.delete(handler);
    },
    dispatch(event) {
      handlers.forEach((handler) => handler(event));
    },
  };
}

function testKeyboardShortcutsUndoAndRedoByAction() {
  const calls = [];
  const target = createKeyboardTarget();
  const remove = installUndoRedoShortcuts(target, {
    undo() {
      calls.push('undo');
      return true;
    },
    redo() {
      calls.push('redo');
      return true;
    },
  });

  target.dispatch({ key: 'z', metaKey: true, preventDefault: () => calls.push('prevent') });
  target.dispatch({ key: 'Z', ctrlKey: true, shiftKey: true, preventDefault: () => calls.push('prevent') });
  target.dispatch({ key: 'y', ctrlKey: true, preventDefault: () => calls.push('prevent') });
  remove();
  target.dispatch({ key: 'z', metaKey: true, preventDefault: () => calls.push('prevent') });

  assert.deepStrictEqual(calls, ['undo', 'prevent', 'redo', 'prevent', 'redo', 'prevent']);
}

testHistoryRetainsLastFiftyActions();
testRedoIsClearedAfterNewUserAction();
testPersistenceUsesNamespaceAndRestoresRawCellsAndSelection();
testKeyboardShortcutsUndoAndRedoByAction();

console.log('history-persistence tests passed');
