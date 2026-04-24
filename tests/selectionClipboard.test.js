const assert = require('assert');
const {
  createSelection,
  extendSelection,
  selectionBounds,
  clearSelection,
  copySelection,
  cutSelection,
  pasteClipboard,
} = require('../src/selectionClipboard');

function mapFrom(entries) {
  return new Map(entries.map(([row, col, raw]) => [`${row},${col}`, raw]));
}

function getCell(cells, row, col) {
  return cells.get(`${row},${col}`) || '';
}

function setCell(cells, row, col, raw) {
  const key = `${row},${col}`;
  if (raw === '') cells.delete(key);
  else cells.set(key, raw);
}

function run() {
  const selection = createSelection({ row: 1, col: 1 });
  const dragged = extendSelection(selection, { row: 3, col: 2 });
  assert.deepStrictEqual(selectionBounds(dragged), {
    top: 1,
    left: 1,
    bottom: 3,
    right: 2,
    rows: 3,
    cols: 2,
  });
  assert.deepStrictEqual(dragged.active, { row: 1, col: 1 });
  assert.deepStrictEqual(dragged.focus, { row: 3, col: 2 });

  const shifted = extendSelection(selection, { row: 1, col: 3 });
  assert.deepStrictEqual(selectionBounds(shifted), {
    top: 1,
    left: 1,
    bottom: 1,
    right: 3,
    rows: 1,
    cols: 3,
  });

  const cells = mapFrom([
    [1, 1, 'A'],
    [1, 2, '=A1+$B$2'],
    [2, 1, 'C'],
    [2, 2, '=SUM(A1:B1)'],
  ]);
  const blockSelection = extendSelection(createSelection({ row: 1, col: 1 }), { row: 2, col: 2 });
  assert.strictEqual(copySelection(blockSelection, (row, col) => getCell(cells, row, col)).text, 'A\t=A1+$B$2\nC\t=SUM(A1:B1)');

  clearSelection(blockSelection, (row, col) => setCell(cells, row, col, ''));
  assert.strictEqual(getCell(cells, 1, 1), '');
  assert.strictEqual(getCell(cells, 2, 2), '');

  const cutCells = mapFrom([
    [4, 4, 'Move'],
    [4, 5, '=D4'],
  ]);
  const cut = cutSelection(
    extendSelection(createSelection({ row: 4, col: 4 }), { row: 4, col: 5 }),
    (row, col) => getCell(cutCells, row, col),
    (row, col) => setCell(cutCells, row, col, '')
  );
  assert.strictEqual(getCell(cutCells, 4, 4), '');
  pasteClipboard(cut, createSelection({ row: 6, col: 2 }), (row, col, raw) => setCell(cutCells, row, col, raw));
  assert.strictEqual(getCell(cutCells, 6, 2), 'Move');
  assert.strictEqual(getCell(cutCells, 6, 3), '=B6');

  const pasteCells = new Map();
  pasteClipboard(
    { text: '=A1+$B2+A$1\tplain', source: { row: 1, col: 1 }, cut: false },
    createSelection({ row: 3, col: 4 }),
    (row, col, raw) => setCell(pasteCells, row, col, raw)
  );
  assert.strictEqual(getCell(pasteCells, 3, 4), '=D3+$B4+D$1');
  assert.strictEqual(getCell(pasteCells, 3, 5), 'plain');

  const matchingRangeCells = new Map();
  pasteClipboard(
    { text: '1\t2\n3\t4', source: null, cut: false },
    extendSelection(createSelection({ row: 8, col: 8 }), { row: 9, col: 9 }),
    (row, col, raw) => setCell(matchingRangeCells, row, col, raw)
  );
  assert.strictEqual(getCell(matchingRangeCells, 8, 8), '1');
  assert.strictEqual(getCell(matchingRangeCells, 9, 9), '4');
}

run();
console.log('selectionClipboard tests passed');
