const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRange,
  listAddressesInRange,
} = require('../src/selection.js');

test('normalizes a dragged range regardless of direction', () => {
  assert.deepEqual(
    normalizeRange('C3', 'A1'),
    { start: 'A1', end: 'C3' }
  );
});

test('lists all addresses inside a rectangular range', () => {
  assert.deepEqual(
    listAddressesInRange('B2', 'C3'),
    ['B2', 'C2', 'B3', 'C3']
  );
});
