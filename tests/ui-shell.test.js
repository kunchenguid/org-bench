const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SHEET_COLUMNS,
  SHEET_ROWS,
  buildSurfaceModel,
  getColumnLabel,
} = require('../app.js');

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
    endColumn: 2,
    endRow: 3,
  });
  assert.equal(model.rows[0].cells[0].address, 'A1');
  assert.equal(model.rows[99].cells[25].address, 'Z100');
});
