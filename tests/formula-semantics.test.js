const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheetCore } = require('../app.js');

test('COUNT does not count direct references to empty cells', () => {
  const core = createSpreadsheetCore({ rows: 100, cols: 26 });
  core.setCell('B1', '=COUNT(A1)');

  assert.equal(core.getCellDisplay('B1'), '0');
});
