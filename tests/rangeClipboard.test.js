const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampCell,
  createSelection,
  selectionBounds,
  selectToCell,
  moveSelection,
  clearSelectedCells,
  selectionToClipboard,
  pasteClipboard,
} = require('../src/rangeClipboard.js');

test('createSelection uses active cell as a single-cell range', () => {
  const selection = createSelection({ col: 2, row: 4 });

  assert.deepEqual(selection, {
    anchor: { col: 2, row: 4 },
    focus: { col: 2, row: 4 },
    active: { col: 2, row: 4 },
  });
});

test('selectToCell preserves anchor and updates focus and active cell', () => {
  const selection = createSelection({ col: 1, row: 1 });

  assert.deepEqual(selectToCell(selection, { col: 3, row: 5 }), {
    anchor: { col: 1, row: 1 },
    focus: { col: 3, row: 5 },
    active: { col: 3, row: 5 },
  });
});

test('selectionBounds normalizes reversed rectangular ranges', () => {
  const bounds = selectionBounds({
    anchor: { col: 4, row: 8 },
    focus: { col: 2, row: 3 },
    active: { col: 2, row: 3 },
  });

  assert.deepEqual(bounds, {
    left: 2,
    right: 4,
    top: 3,
    bottom: 8,
    width: 3,
    height: 6,
  });
});

test('moveSelection with shift extends the range and clamps at grid edges', () => {
  const selection = createSelection({ col: 0, row: 0 });

  const extended = moveSelection(selection, { dCol: -1, dRow: 1 }, { cols: 26, rows: 100 }, { extend: true });

  assert.deepEqual(extended, {
    anchor: { col: 0, row: 0 },
    focus: { col: 0, row: 1 },
    active: { col: 0, row: 1 },
  });
});

test('moveSelection without shift collapses to the moved active cell', () => {
  const selection = {
    anchor: { col: 1, row: 1 },
    focus: { col: 3, row: 3 },
    active: { col: 3, row: 3 },
  };

  assert.deepEqual(moveSelection(selection, { dCol: 1, dRow: 0 }, { cols: 26, rows: 100 }), {
    anchor: { col: 4, row: 3 },
    focus: { col: 4, row: 3 },
    active: { col: 4, row: 3 },
  });
});

test('clearSelectedCells removes every raw cell in the selected rectangle', () => {
  const cells = {
    '1,1': '10',
    '2,1': '20',
    '1,2': '=A1+B1',
    '5,5': 'keep',
  };
  const selection = {
    anchor: { col: 1, row: 1 },
    focus: { col: 2, row: 2 },
    active: { col: 2, row: 2 },
  };

  assert.deepEqual(clearSelectedCells(cells, selection), {
    cells: {
      '5,5': 'keep',
    },
    cleared: ['1,1', '2,1', '1,2', '2,2'],
  });
});

test('selectionToClipboard serializes a block and preserves empty cells', () => {
  const cells = {
    '1,1': '1',
    '2,1': '=A1',
    '1,2': 'hello',
  };
  const selection = {
    anchor: { col: 1, row: 1 },
    focus: { col: 2, row: 2 },
    active: { col: 1, row: 1 },
  };

  assert.deepEqual(selectionToClipboard(cells, selection), {
    text: '1\t=A1\nhello\t',
    data: {
      width: 2,
      height: 2,
      source: { col: 1, row: 1 },
      rows: [
        ['1', '=A1'],
        ['hello', ''],
      ],
    },
  });
});

test('pasteClipboard writes a block at destination and shifts formulas with the provided hook', () => {
  const calls = [];
  const result = pasteClipboard(
    { '9,9': 'keep' },
    {
      width: 2,
      height: 2,
      source: { col: 1, row: 1 },
      rows: [
        ['1', '=A1+B1'],
        ['', '=SUM(A1:B1)'],
      ],
    },
    { col: 4, row: 5 },
    {
      adjustFormula(raw, context) {
        calls.push({ raw, context });
        return `${raw}|${context.colOffset},${context.rowOffset}`;
      },
    }
  );

  assert.deepEqual(result, {
    cells: {
      '9,9': 'keep',
      '4,5': '1',
      '5,5': '=A1+B1|3,4',
      '4,6': '',
      '5,6': '=SUM(A1:B1)|3,4',
    },
    written: ['4,5', '5,5', '4,6', '5,6'],
  });
  assert.deepEqual(calls, [
    {
      raw: '=A1+B1',
      context: { source: { col: 1, row: 1 }, destination: { col: 4, row: 5 }, colOffset: 3, rowOffset: 4 },
    },
    {
      raw: '=SUM(A1:B1)',
      context: { source: { col: 1, row: 1 }, destination: { col: 4, row: 5 }, colOffset: 3, rowOffset: 4 },
    },
  ]);
});

test('pasteClipboard can act as a cut and clears the original source block after writing destination', () => {
  const cells = {
    '1,1': '1',
    '2,1': '2',
    '1,2': '3',
    '2,2': '4',
  };
  const clipboard = selectionToClipboard(cells, {
    anchor: { col: 1, row: 1 },
    focus: { col: 2, row: 2 },
    active: { col: 1, row: 1 },
  });

  assert.deepEqual(
    pasteClipboard(cells, clipboard.data, { col: 3, row: 4 }, { cut: true }),
    {
      cells: {
        '3,4': '1',
        '4,4': '2',
        '3,5': '3',
        '4,5': '4',
      },
      written: ['3,4', '4,4', '3,5', '4,5'],
      cleared: ['1,1', '2,1', '1,2', '2,2'],
    }
  );
});

test('clampCell keeps coordinates inside grid bounds', () => {
  assert.deepEqual(clampCell({ col: -2, row: 101 }, { cols: 26, rows: 100 }), { col: 0, row: 99 });
});
