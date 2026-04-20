const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createStorageKey,
  moveSelection,
  cellIdToPosition,
  positionToCellId,
} = require('../src/spreadsheet-state.js');

test('prefixes persisted keys with the injected namespace', () => {
  assert.equal(createStorageKey('bench-42', 'state'), 'bench-42:state');
  assert.equal(createStorageKey('', 'state'), 'spreadsheet:state');
});

test('moves the selection within the sheet bounds', () => {
  assert.equal(moveSelection('A1', 0, -1, 26, 100), 'A1');
  assert.equal(moveSelection('A1', -1, 0, 26, 100), 'A1');
  assert.equal(moveSelection('A1', 1, 0, 26, 100), 'B1');
  assert.equal(moveSelection('A1', 0, 1, 26, 100), 'A2');
  assert.equal(moveSelection('Z100', 1, 0, 26, 100), 'Z100');
  assert.equal(moveSelection('Z100', 0, 1, 26, 100), 'Z100');
});

test('converts between cell ids and positions', () => {
  assert.deepEqual(cellIdToPosition('C12'), { col: 2, row: 11 });
  assert.equal(positionToCellId(25, 99), 'Z100');
});
