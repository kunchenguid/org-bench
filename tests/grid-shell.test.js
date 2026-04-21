const assert = require('node:assert/strict');
const {
  createColumnLabels,
  createGridRows,
  clampCell,
  createInitialSelection,
  selectionFromEndpoints,
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

if (process.exitCode) {
  process.exit(process.exitCode);
}
