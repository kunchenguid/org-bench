const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCellAriaLabel } = require('../cell-accessibility');

test('includes the cell address and rendered value in the accessible label', () => {
  assert.equal(buildCellAriaLabel('B3', '7'), 'B3 7');
});

test('surfaces blank cells and spreadsheet errors to assistive tech', () => {
  assert.equal(buildCellAriaLabel('C4', ''), 'C4 blank');
  assert.equal(buildCellAriaLabel('D5', '#DIV/0!'), 'D5 #DIV/0!');
});
