const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildClipboardPayload,
  clearSelectedRange,
  applyClipboardPaste,
} = require('../src/clipboard.js');
const {
  createSpreadsheetStore,
  createMemoryStorage,
} = require('../src/spreadsheet-store.js');

test('clearSelectedRange removes every cell in the rectangular selection', () => {
  const store = createSpreadsheetStore({
    namespace: 'run-clear-range',
    storage: createMemoryStorage(),
  });

  store.applyCells(
    {
      A1: '10',
      B1: '20',
      A2: '30',
      B2: '40',
      C3: 'keep',
    },
    { label: 'seed' }
  );

  const changed = clearSelectedRange(store, {
    anchor: { row: 0, col: 0 },
    focus: { row: 1, col: 1 },
  });

  assert.equal(changed, true);
  assert.equal(store.getRawCell('A1'), '');
  assert.equal(store.getRawCell('B1'), '');
  assert.equal(store.getRawCell('A2'), '');
  assert.equal(store.getRawCell('B2'), '');
  assert.equal(store.getRawCell('C3'), 'keep');
  assert.equal(store.getSnapshot().history.undo.at(-1).label, 'clear');
});

test('buildClipboardPayload returns a rectangular raw-value matrix for the selection', () => {
  const store = createSpreadsheetStore({
    namespace: 'run-copy-shape',
    storage: createMemoryStorage(),
  });

  store.applyCells(
    {
      B2: 'Alpha',
      C2: 'Beta',
      B3: '=A1',
    },
    { label: 'seed' }
  );

  const payload = buildClipboardPayload(store.getSnapshot(), {
    anchor: { row: 1, col: 1 },
    focus: { row: 2, col: 2 },
  }, 'copy');

  assert.deepEqual(payload, {
    kind: 'cell-range',
    mode: 'copy',
    width: 2,
    height: 2,
    source: {
      anchor: { row: 1, col: 1 },
      focus: { row: 2, col: 2 },
    },
    rows: [
      ['Alpha', 'Beta'],
      ['=A1', ''],
    ],
  });
});

test('applyClipboardPaste pastes a copied block from its top-left into the target cell', () => {
  const store = createSpreadsheetStore({
    namespace: 'run-paste-top-left',
    storage: createMemoryStorage(),
  });

  const payload = {
    kind: 'cell-range',
    mode: 'copy',
    width: 2,
    height: 2,
    source: {
      anchor: { row: 0, col: 0 },
      focus: { row: 1, col: 1 },
    },
    rows: [
      ['1', '2'],
      ['3', '=A1'],
    ],
  };

  applyClipboardPaste(store, payload, {
    anchor: { row: 4, col: 2 },
    focus: { row: 4, col: 2 },
  });

  assert.deepEqual(
    Object.fromEntries(store.getSnapshot().cells.entries()),
    {
      C5: '1',
      D5: '2',
      C6: '3',
      D6: '=A1',
    }
  );
  assert.equal(store.getSnapshot().history.undo.at(-1).label, 'paste');
});

test('applyClipboardPaste maps cell-for-cell when the destination selection matches the payload size', () => {
  const store = createSpreadsheetStore({
    namespace: 'run-paste-match',
    storage: createMemoryStorage(),
  });

  const payload = {
    kind: 'cell-range',
    mode: 'copy',
    width: 2,
    height: 2,
    source: {
      anchor: { row: 0, col: 0 },
      focus: { row: 1, col: 1 },
    },
    rows: [
      ['north', 'east'],
      ['south', 'west'],
    ],
  };

  applyClipboardPaste(store, payload, {
    anchor: { row: 7, col: 3 },
    focus: { row: 8, col: 4 },
  });

  assert.deepEqual(
    Object.fromEntries(store.getSnapshot().cells.entries()),
    {
      D8: 'north',
      E8: 'east',
      D9: 'south',
      E9: 'west',
    }
  );
});

test('applyClipboardPaste clears the source cells for cut payloads and supports destination transforms', () => {
  const store = createSpreadsheetStore({
    namespace: 'run-cut-paste',
    storage: createMemoryStorage(),
  });

  store.applyCells(
    {
      A1: '9',
      B1: '=A1',
    },
    { label: 'seed' }
  );

  const payload = buildClipboardPayload(store.getSnapshot(), {
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 1 },
  }, 'cut');

  applyClipboardPaste(
    store,
    payload,
    {
      anchor: { row: 2, col: 2 },
      focus: { row: 2, col: 2 },
    },
    {
      transformCell(raw, context) {
        if (raw !== '=A1') {
          return raw;
        }
        assert.deepEqual(context.sourceCell, { row: 0, col: 1 });
        assert.deepEqual(context.targetCell, { row: 2, col: 3 });
        return '=C3';
      },
    }
  );

  assert.deepEqual(
    Object.fromEntries(store.getSnapshot().cells.entries()),
    {
      C3: '9',
      D3: '=C3',
    }
  );
  assert.equal(store.getRawCell('A1'), '');
  assert.equal(store.getRawCell('B1'), '');
  assert.equal(store.getSnapshot().history.undo.at(-1).label, 'cut-paste');
});
