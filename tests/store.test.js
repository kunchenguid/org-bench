const test = require('node:test');
const assert = require('node:assert/strict');

const { createStore, toCellId } = require('../src/store.js');

test('store starts with A1 selected and preserves raw cell contents', () => {
  const store = createStore();

  assert.equal(store.getSelection().anchor, 'A1');
  assert.equal(toCellId(0, 0), 'A1');

  store.setCell('B2', '=A1+1');

  assert.equal(store.getCell('B2').raw, '=A1+1');
  assert.deepEqual(store.getUsedCellIds(), ['B2']);
});

test('store clears cells when their raw value becomes empty', () => {
  const store = createStore();

  store.setCell('C3', '42');
  store.setCell('C3', '');

  assert.equal(store.getCell('C3'), null);
  assert.deepEqual(store.getUsedCellIds(), []);
});
