const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SHEET_COLUMNS,
  SHEET_ROWS,
  buildSurfaceModel,
  getColumnLabel,
  getPasteStart,
  parseClipboardText,
  selectionToBounds,
  serializeClipboardMatrix,
  shiftClipboardMatrix,
} = require('../app.js');
const { shiftFormula } = require('../src/formula-engine.js');

test('surface model defines spreadsheet chrome and default highlights', () => {
  assert.equal(SHEET_COLUMNS, 26);
  assert.equal(SHEET_ROWS, 100);
  assert.equal(getColumnLabel(0), 'A');
  assert.equal(getColumnLabel(25), 'Z');

  const model = buildSurfaceModel();

  assert.equal(model.formulaBar.label, 'fx');
  assert.equal(model.columns.length, 26);
  assert.equal(model.rows.length, 100);
  assert.deepEqual(model.activeCell, { column: 0, row: 0 });
  assert.deepEqual(model.range, {
    startColumn: 0,
    startRow: 0,
    endColumn: 0,
    endRow: 0,
  });
  assert.equal(model.rows[0].cells[0].address, 'A1');
  assert.equal(model.rows[99].cells[25].address, 'Z100');
});

test('serializes and parses clipboard TSV blocks without dropping empty cells', () => {
  const matrix = [
    ['1', '=A1', ''],
    ['', 'hello', '42'],
  ];

  const text = serializeClipboardMatrix(matrix);
  assert.equal(text, '1\t=A1\t\n\thello\t42');
  assert.deepEqual(parseClipboardText(text + '\n'), matrix);
});

test('uses matching target ranges and shifts relative formulas during paste preparation', () => {
  const selection = {
    active: { row: 5, col: 5 },
    anchor: { row: 5, col: 5 },
    range: {
      start: { row: 5, col: 5 },
      end: { row: 6, col: 6 },
    },
    activeCellId: 'E5',
  };

  assert.deepEqual(selectionToBounds(selection), {
    start: { row: 5, col: 5 },
    end: { row: 6, col: 6 },
  });
  assert.deepEqual(getPasteStart(selection, [['1', '2'], ['3', '4']]), { row: 5, col: 5 });
  assert.deepEqual(
    shiftClipboardMatrix([['=A1+$B1+C$1+$D$1']], 2, 3, shiftFormula),
    [['=D3+$B3+F$1+$D$1']]
  );
});
