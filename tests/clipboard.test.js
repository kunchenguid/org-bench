const test = require('node:test');
const assert = require('node:assert/strict');

const { selectionToMatrix, matrixToTsv, buildPasteChanges, clearSelection } = require('../clipboard.js');

test('serializes a rectangular selection to tsv in row-major order', () => {
  const cells = {
    A1: '1',
    B1: '=A1+1',
    A2: 'hello',
    B2: '4',
  };

  const matrix = selectionToMatrix(cells, { startRow: 0, endRow: 1, startCol: 0, endCol: 1 });

  assert.deepEqual(matrix, [
    ['1', '=A1+1'],
    ['hello', '4'],
  ]);
  assert.equal(matrixToTsv(matrix), '1\t=A1+1\nhello\t4');
});

test('builds paste changes and shifts relative formulas from the source origin', () => {
  const changes = buildPasteChanges({
    source: [
      ['=A1+1', '4'],
      ['text', '=B2'],
    ],
    destination: { startRow: 2, endRow: 2, startCol: 2, endCol: 2 },
  });

  assert.deepEqual(changes, {
    C3: '=C3+1',
    D3: '4',
    C4: 'text',
    D4: '=D4',
  });
});

test('clears every populated cell inside a selection', () => {
  const next = clearSelection({
    A1: '1',
    B2: '2',
    C3: '3',
  }, { startRow: 0, endRow: 1, startCol: 0, endCol: 1 });

  assert.deepEqual(next, {
    C3: '3',
  });
});
