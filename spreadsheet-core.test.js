const test = require('node:test');
const assert = require('node:assert/strict');

const {
  columnIndexToName,
  createEmptySheet,
  evaluateSheet,
  makeStorageKey,
} = require('./spreadsheet-core.js');

test('column indexes map to spreadsheet labels', () => {
  assert.equal(columnIndexToName(0), 'A');
  assert.equal(columnIndexToName(25), 'Z');
});

test('empty sheet starts with an A1 selection', () => {
  const sheet = createEmptySheet();

  assert.equal(sheet.rows, 100);
  assert.equal(sheet.cols, 26);
  assert.deepEqual(sheet.selected, { row: 0, col: 0 });
  assert.deepEqual(sheet.cells, {});
});

test('sheet evaluation handles numbers, text, formulas, and references', () => {
  const values = evaluateSheet({
    A1: '2',
    A2: '3',
    A3: '=A1+A2*4',
    A4: '=A3/2',
    B1: 'hello',
  });

  assert.equal(values.A1.display, '2');
  assert.equal(values.A3.display, '14');
  assert.equal(values.A4.display, '7');
  assert.equal(values.B1.display, 'hello');
});

test('sheet evaluation detects circular references', () => {
  const values = evaluateSheet({
    A1: '=B1',
    B1: '=A1',
  });

  assert.equal(values.A1.display, '#CIRC!');
  assert.equal(values.B1.display, '#CIRC!');
});

test('storage keys are prefixed by the benchmark namespace', () => {
  assert.equal(makeStorageKey('bench-123:', 'sheet'), 'bench-123:sheet');
});
