const test = require('node:test');
const assert = require('node:assert/strict');

const {
  columnLabelFromIndex,
  cellIdFromPosition,
  resolveStorageNamespace,
} = require('./app-core.js');

test('columnLabelFromIndex maps zero-based indexes to spreadsheet labels', () => {
  assert.equal(columnLabelFromIndex(0), 'A');
  assert.equal(columnLabelFromIndex(25), 'Z');
  assert.equal(columnLabelFromIndex(26), 'AA');
});

test('cellIdFromPosition builds A1-style references', () => {
  assert.equal(cellIdFromPosition(0, 0), 'A1');
  assert.equal(cellIdFromPosition(2, 4), 'E3');
});

test('resolveStorageNamespace prefers injected namespace and falls back safely', () => {
  assert.equal(resolveStorageNamespace({ ORACLE_STORAGE_NAMESPACE: 'oracle-run-123' }), 'oracle-run-123');
  assert.equal(
    resolveStorageNamespace({ location: { pathname: '/oracle/run-123/index.html' } }),
    'oracle-sheet:/oracle/run-123/index.html'
  );
});
