const test = require('node:test');
const assert = require('node:assert/strict');

const {
  advanceClipboardState,
  beginEditSession,
  commitEditSession,
  createClipboardState,
  getSelectionAfterStructureChange,
  matchClipboardState,
  resolveStorageNamespace,
  updateEditSession,
} = require('../app-state.js');

test('prefers injected benchmark namespace and falls back to page-specific location', () => {
  assert.equal(
    resolveStorageNamespace({ __BENCHMARK_STORAGE_NAMESPACE__: 'run-123', location: { href: 'file:///tmp/a/index.html' } }),
    'run-123'
  );
  assert.equal(
    resolveStorageNamespace({ location: { href: 'file:///tmp/a/index.html' } }),
    'file:///tmp/a/index.html'
  );
});

test('edit sessions keep a draft without overwriting the committed cell value', () => {
  const started = beginEditSession('A1', '=OLD', false);
  const updated = updateEditSession(started, '=NEW');

  assert.equal(started.previous, '=OLD');
  assert.equal(updated.draft, '=NEW');
  assert.equal(commitEditSession(updated, false), '=NEW');
});

test('canceling an edit session restores the previous raw value', () => {
  const started = beginEditSession('B2', '42', true, '1');
  const updated = updateEditSession(started, '123');

  assert.equal(commitEditSession(updated, true), '42');
});

test('ordinary copies keep their source anchor across repeated pastes', () => {
  const clipboard = createClipboardState('=B2+C2', { minRow: 1, maxRow: 1, minCol: 1, maxCol: 2 }, false);

  assert.deepEqual(matchClipboardState(clipboard, '=B2+C2').bounds, { minRow: 1, maxRow: 1, minCol: 1, maxCol: 2 });
  assert.equal(advanceClipboardState(clipboard).cut, false);
  assert.deepEqual(matchClipboardState(advanceClipboardState(clipboard), '=B2+C2').bounds, { minRow: 1, maxRow: 1, minCol: 1, maxCol: 2 });
});

test('cut clipboard state clears after the first successful paste', () => {
  const clipboard = createClipboardState('7\t=A1*2', { minRow: 0, maxRow: 0, minCol: 0, maxCol: 1 }, true);

  assert.equal(advanceClipboardState(clipboard), null);
});

test('inserting above the active row keeps the selection on the same underlying data', () => {
  assert.deepEqual(
    getSelectionAfterStructureChange(
      {
        anchor: { row: 4, col: 2 },
        focus: { row: 4, col: 2 },
      },
      { axis: 'row', kind: 'insert', index: 2 }
    ),
    {
      anchor: { row: 5, col: 2 },
      focus: { row: 5, col: 2 },
    }
  );
});

test('deleting the active column keeps selection on the replacement column when possible', () => {
  assert.deepEqual(
    getSelectionAfterStructureChange(
      {
        anchor: { row: 3, col: 4 },
        focus: { row: 3, col: 4 },
      },
      { axis: 'col', kind: 'delete', index: 4 }
    ),
    {
      anchor: { row: 3, col: 4 },
      focus: { row: 3, col: 4 },
    }
  );
});
