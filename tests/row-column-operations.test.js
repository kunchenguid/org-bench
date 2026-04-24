const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createSheet,
  setCell,
  insertRows,
  deleteRows,
  insertColumns,
  deleteColumns,
  getCell,
} = require('../rowColumnOperations.js');

test('inserting a row shifts data down and rewrites formula references to keep pointing at the same cells', () => {
  const sheet = createSheet(5, 5);
  setCell(sheet, 'A1', '5');
  setCell(sheet, 'B2', '10');
  setCell(sheet, 'C1', '=A1+B2');

  const action = insertRows(sheet, 1, 1);

  assert.equal(getCell(sheet, 'B2'), '');
  assert.equal(getCell(sheet, 'B3'), '10');
  assert.equal(getCell(sheet, 'C1'), '=A1+B3');
  assert.deepEqual(action.undo, { type: 'deleteRows', index: 1, count: 1 });
});

test('deleting a row removes data and rewrites deleted references to #REF!', () => {
  const sheet = createSheet(5, 5);
  setCell(sheet, 'B2', '10');
  setCell(sheet, 'C1', '=B2*2');

  const action = deleteRows(sheet, 1, 1);

  assert.equal(getCell(sheet, 'B2'), '');
  assert.equal(getCell(sheet, 'C1'), '=#REF!*2');
  assert.equal(action.deletedCells.length, 1);
  assert.deepEqual(action.undo, { type: 'insertRows', index: 1, count: 1, restore: action.deletedCells });
});

test('inserting a column shifts data right and rewrites formula references', () => {
  const sheet = createSheet(5, 5);
  setCell(sheet, 'A1', '5');
  setCell(sheet, 'B2', '10');
  setCell(sheet, 'C1', '=A1+B2');

  const action = insertColumns(sheet, 1, 1);

  assert.equal(getCell(sheet, 'B2'), '');
  assert.equal(getCell(sheet, 'C2'), '10');
  assert.equal(getCell(sheet, 'D1'), '=A1+C2');
  assert.deepEqual(action.undo, { type: 'deleteColumns', index: 1, count: 1 });
});

test('deleting a column removes data and rewrites deleted references to #REF!', () => {
  const sheet = createSheet(5, 5);
  setCell(sheet, 'B2', '10');
  setCell(sheet, 'C1', '=B2*2');

  const action = deleteColumns(sheet, 1, 1);

  assert.equal(getCell(sheet, 'B2'), '');
  assert.equal(getCell(sheet, 'B1'), '=#REF!*2');
  assert.equal(action.deletedCells.length, 1);
  assert.deepEqual(action.undo, { type: 'insertColumns', index: 1, count: 1, restore: action.deletedCells });
});
