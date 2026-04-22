const assert = require('node:assert/strict');
const {
  createColumnLabels,
  createGridRows,
  clampCell,
  createInitialSelection,
  selectionFromEndpoints,
  createHeaderActionItems,
  applyStructuralCommand,
  selectionFromRuntimeSelection,
  handleHistoryHotkey,
} = require('../app.js');

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test('createColumnLabels returns spreadsheet headers from A to Z', () => {
  assert.deepEqual(createColumnLabels(26), [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  ]);
});

test('createGridRows builds a 100x26 addressable grid model', () => {
  const rows = createGridRows(100, 26);
  assert.equal(rows.length, 100);
  assert.equal(rows[0].cells.length, 26);
  assert.equal(rows[0].cells[0].address, 'A1');
  assert.equal(rows[99].cells[25].address, 'Z100');
});

test('clampCell keeps selection inside the rendered grid bounds', () => {
  assert.deepEqual(clampCell({ row: -4, column: 30 }, 100, 26), { row: 0, column: 25 });
  assert.deepEqual(clampCell({ row: 12, column: 6 }, 100, 26), { row: 12, column: 6 });
});

test('selectionFromEndpoints expands into a rectangular range and preserves the active cell', () => {
  assert.deepEqual(
    selectionFromEndpoints({ row: 8, column: 4 }, { row: 3, column: 1 }),
    {
      anchor: { row: 8, column: 4 },
      focus: { row: 3, column: 1 },
      minRow: 3,
      maxRow: 8,
      minColumn: 1,
      maxColumn: 4,
      active: { row: 3, column: 1 },
    }
  );
});

test('createInitialSelection starts on A1 with a single-cell range', () => {
  assert.deepEqual(createInitialSelection(), {
    anchor: { row: 0, column: 0 },
    focus: { row: 0, column: 0 },
    minRow: 0,
    maxRow: 0,
    minColumn: 0,
    maxColumn: 0,
    active: { row: 0, column: 0 },
  });
});

test('createHeaderActionItems exposes discoverable row and column commands', () => {
  assert.deepEqual(createHeaderActionItems('row', 3), [
    { label: 'Insert above', command: { type: 'insert-row', index: 3 } },
    { label: 'Insert below', command: { type: 'insert-row', index: 4 } },
    { label: 'Delete row', command: { type: 'delete-row', index: 3 } },
  ]);

  assert.deepEqual(createHeaderActionItems('column', 2), [
    { label: 'Insert left', command: { type: 'insert-column', index: 2 } },
    { label: 'Insert right', command: { type: 'insert-column', index: 3 } },
    { label: 'Delete column', command: { type: 'delete-column', index: 2 } },
  ]);
});

test('applyStructuralCommand rewrites formulas and grows the sheet for row inserts', () => {
  const nextState = applyStructuralCommand({
    rowCount: 100,
    columnCount: 26,
    cells: {
      A1: '10',
      A2: '20',
      B1: '=A2',
    },
    selection: selectionFromEndpoints({ row: 1, column: 0 }, { row: 1, column: 0 }),
  }, { type: 'insert-row', index: 2 });

  assert.equal(nextState.rowCount, 101);
  assert.equal(nextState.columnCount, 26);
  assert.deepEqual(nextState.cells, {
    A1: '10',
    A3: '20',
    B1: '=A3',
  });
  assert.deepEqual(nextState.selection.active, { row: 2, column: 0 });
});

test('applyStructuralCommand rewrites formulas and keeps selection in bounds for column deletes', () => {
  const nextState = applyStructuralCommand({
    rowCount: 100,
    columnCount: 26,
    cells: {
      A1: '7',
      B1: '9',
      C1: '=B1',
      D1: '=SUM(A1:C1)',
    },
    selection: selectionFromEndpoints({ row: 0, column: 1 }, { row: 0, column: 1 }),
  }, { type: 'delete-column', index: 2 });

  assert.equal(nextState.rowCount, 100);
  assert.equal(nextState.columnCount, 25);
  assert.deepEqual(nextState.cells, {
    A1: '7',
    B1: '=#REF!',
    C1: '=SUM(A1:B1)',
  });
  assert.deepEqual(nextState.selection.active, { row: 0, column: 1 });
});

test('selectionFromRuntimeSelection clamps restored runtime selection into the grid', () => {
  assert.deepEqual(
    selectionFromRuntimeSelection({ row: 120, col: -4 }, 100, 26),
    {
      anchor: { row: 99, column: 0 },
      focus: { row: 99, column: 0 },
      minRow: 99,
      maxRow: 99,
      minColumn: 0,
      maxColumn: 0,
      active: { row: 99, column: 0 },
    }
  );
});

test('handleHistoryHotkey routes undo and redo shortcuts through runtime', () => {
  const calls = [];
  const runtime = {
    undo() {
      calls.push('undo');
      return { selection: { row: 3, col: 2 } };
    },
    redo() {
      calls.push('redo');
      return { selection: { row: 4, col: 5 } };
    },
  };

  const undoEvent = {
    key: 'z',
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    },
  };

  const redoEvent = {
    key: 'Z',
    metaKey: true,
    ctrlKey: false,
    shiftKey: true,
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    },
  };

  assert.deepEqual(handleHistoryHotkey(undoEvent, runtime), { selection: { row: 3, col: 2 } });
  assert.equal(undoEvent.preventDefaultCalled, true);

  assert.deepEqual(handleHistoryHotkey(redoEvent, runtime), { selection: { row: 4, col: 5 } });
  assert.equal(redoEvent.preventDefaultCalled, true);
  assert.deepEqual(calls, ['undo', 'redo']);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
