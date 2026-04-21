const test = require('node:test');
const assert = require('node:assert/strict');

const selection = require('./range-selection.js');

test('normalizeRange orders corners and preserves full rectangle bounds', () => {
  assert.deepEqual(
    selection.normalizeRange({ row: 4, col: 5 }, { row: 2, col: 1 }),
    {
      startRow: 2,
      endRow: 4,
      startCol: 1,
      endCol: 5,
    }
  );
});

test('buildRangeSelection keeps active cell inside highlighted range', () => {
  const result = selection.buildRangeSelection({ row: 3, col: 3 }, { row: 5, col: 6 });

  assert.deepEqual(result.anchor, { row: 3, col: 3 });
  assert.deepEqual(result.focus, { row: 5, col: 6 });
  assert.deepEqual(result.active, { row: 5, col: 6 });
  assert.deepEqual(result.range, {
    startRow: 3,
    endRow: 5,
    startCol: 3,
    endCol: 6,
  });
});

test('extendSelectionWithArrow clamps to grid bounds while growing from anchor', () => {
  const result = selection.extendSelectionWithArrow(
    { anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } },
    'ArrowLeft',
    { rows: 100, cols: 26 }
  );

  assert.deepEqual(result.focus, { row: 1, col: 1 });
  assert.deepEqual(result.range, {
    startRow: 1,
    endRow: 1,
    startCol: 1,
    endCol: 1,
  });
});

test('extendSelectionWithArrow grows a rectangular range with shift+arrow semantics', () => {
  const result = selection.extendSelectionWithArrow(
    { anchor: { row: 2, col: 2 }, focus: { row: 2, col: 2 } },
    'ArrowDown',
    { rows: 100, cols: 26 }
  );

  assert.deepEqual(result.focus, { row: 3, col: 2 });
  assert.deepEqual(result.range, {
    startRow: 2,
    endRow: 3,
    startCol: 2,
    endCol: 2,
  });
});

test('copyRange returns rectangular raw values row by row', () => {
  const grid = new Map([
    ['1:1', { raw: '1' }],
    ['1:2', { raw: '=A1+1' }],
    ['2:1', { raw: 'hello' }],
  ]);

  assert.deepEqual(
    selection.copyRange(grid, { startRow: 1, endRow: 2, startCol: 1, endCol: 2 }),
    [
      ['1', '=A1+1'],
      ['hello', ''],
    ]
  );
});

test('planClearRange emits clear operations for every cell in the rectangle', () => {
  assert.deepEqual(
    selection.planClearRange({ startRow: 2, endRow: 3, startCol: 4, endCol: 5 }),
    [
      { row: 2, col: 4, raw: '' },
      { row: 2, col: 5, raw: '' },
      { row: 3, col: 4, raw: '' },
      { row: 3, col: 5, raw: '' },
    ]
  );
});

test('planPaste applies formula adjustment hook when pasting into a new location', () => {
  const operations = selection.planPaste(
    [[ '=A1+B1', '3' ]],
    { row: 4, col: 2 },
    {
      adjustCell({ raw, sourceCell, targetCell }) {
        return `${raw}@${sourceCell.row},${sourceCell.col}->${targetCell.row},${targetCell.col}`;
      },
    }
  );

  assert.deepEqual(operations, [
    { row: 4, col: 2, raw: '=A1+B1@1,1->4,2' },
    { row: 4, col: 3, raw: '3@1,2->4,3' },
  ]);
});

test('planPaste repeats a single copied cell across a matching destination rectangle', () => {
  const operations = selection.planPaste(
    [['42']],
    { startRow: 3, endRow: 4, startCol: 2, endCol: 3 }
  );

  assert.deepEqual(operations, [
    { row: 3, col: 2, raw: '42' },
    { row: 3, col: 3, raw: '42' },
    { row: 4, col: 2, raw: '42' },
    { row: 4, col: 3, raw: '42' },
  ]);
});

test('planCut returns copied block and matching clear operations', () => {
  const grid = new Map([
    ['2:2', { raw: '7' }],
    ['2:3', { raw: '=B2' }],
  ]);
  const result = selection.planCut(grid, { startRow: 2, endRow: 2, startCol: 2, endCol: 3 });

  assert.deepEqual(result.block, [['7', '=B2']]);
  assert.deepEqual(result.clearOperations, [
    { row: 2, col: 2, raw: '' },
    { row: 2, col: 3, raw: '' },
  ]);
});
