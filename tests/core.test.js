const test = require('node:test');
const assert = require('node:assert/strict');

const {
  indexToColumnLabel,
  columnLabelToIndex,
  clampSelection,
} = require('../spreadsheet-core.js');

test('indexToColumnLabel maps first and last visible columns', () => {
  assert.equal(indexToColumnLabel(0), 'A');
  assert.equal(indexToColumnLabel(25), 'Z');
});

test('columnLabelToIndex parses visible column labels', () => {
  assert.equal(columnLabelToIndex('A'), 0);
  assert.equal(columnLabelToIndex('Z'), 25);
});

test('clampSelection keeps the active cell inside the grid', () => {
  assert.deepEqual(clampSelection({ row: -1, col: 40 }, 100, 26), { row: 0, col: 25 });
  assert.deepEqual(clampSelection({ row: 4, col: 6 }, 100, 26), { row: 4, col: 6 });
});
