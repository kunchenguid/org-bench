const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRange,
  extendRange,
  clearRange,
  copyRange,
  pasteBlock,
} = require('../spreadsheet-core.js');

test('normalizeRange orders a dragged rectangle and preserves active cell', () => {
  assert.deepEqual(
    normalizeRange({ row: 4, col: 5 }, { row: 2, col: 3 }),
    {
      start: { row: 2, col: 3 },
      end: { row: 4, col: 5 },
      active: { row: 4, col: 5 },
    }
  );
});

test('extendRange keeps the original anchor while moving the active edge', () => {
  assert.deepEqual(
    extendRange(
      {
        start: { row: 2, col: 2 },
        end: { row: 2, col: 2 },
        active: { row: 2, col: 2 },
      },
      { row: 4, col: 1 }
    ),
    {
      start: { row: 2, col: 1 },
      end: { row: 4, col: 2 },
      active: { row: 4, col: 1 },
    }
  );
});

test('clearRange blanks every cell inside the rectangle only', () => {
  const cells = {
    '1,1': 'keep',
    '2,2': 'A',
    '2,3': 'B',
    '3,2': 'C',
    '3,3': 'D',
    '4,4': 'keep',
  };

  assert.deepEqual(
    clearRange(cells, {
      start: { row: 2, col: 2 },
      end: { row: 3, col: 3 },
      active: { row: 2, col: 2 },
    }),
    {
      '1,1': 'keep',
      '4,4': 'keep',
    }
  );
});

test('copyRange returns a tsv block matching the selected rectangle', () => {
  const cells = {
    '1,1': 'A',
    '1,2': 'B',
    '2,1': 'C',
    '2,2': 'D',
  };

  assert.equal(
    copyRange(cells, {
      start: { row: 1, col: 1 },
      end: { row: 2, col: 2 },
      active: { row: 1, col: 1 },
    }),
    'A\tB\nC\tD'
  );
});

test('pasteBlock writes a copied block using the destination as top-left', () => {
  assert.deepEqual(
    pasteBlock(
      { '1,1': 'old' },
      {
        start: { row: 4, col: 3 },
        end: { row: 4, col: 3 },
        active: { row: 4, col: 3 },
      },
      '1\t2\n3\t4'
    ),
    {
      cells: {
        '1,1': 'old',
        '4,3': '1',
        '4,4': '2',
        '5,3': '3',
        '5,4': '4',
      },
      range: {
        start: { row: 4, col: 3 },
        end: { row: 5, col: 4 },
        active: { row: 4, col: 3 },
      },
    }
  );
});

test('pasteBlock clears a cut source after writing the destination block', () => {
  assert.deepEqual(
    pasteBlock(
      {
        '1,1': 'A',
        '1,2': 'B',
        '2,1': 'C',
        '2,2': 'D',
        '4,4': 'stay',
      },
      {
        start: { row: 4, col: 1 },
        end: { row: 4, col: 1 },
        active: { row: 4, col: 1 },
      },
      'A\tB\nC\tD',
      {
        cutRange: {
          start: { row: 1, col: 1 },
          end: { row: 2, col: 2 },
          active: { row: 1, col: 1 },
        },
      }
    ),
    {
      cells: {
        '4,1': 'A',
        '4,2': 'B',
        '5,1': 'C',
        '5,2': 'D',
        '4,4': 'stay',
      },
      range: {
        start: { row: 4, col: 1 },
        end: { row: 5, col: 2 },
        active: { row: 4, col: 1 },
      },
    }
  );
});
