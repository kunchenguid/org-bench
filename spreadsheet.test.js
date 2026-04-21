const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheet } = require('./spreadsheet.js');

test('evaluates formulas and tracks the selected cell', () => {
  const sheet = createSpreadsheet({ rows: 10, cols: 5, storage: null, storageKeyPrefix: 'test:' });

  sheet.setCellRaw('A1', '2');
  sheet.setCellRaw('A2', '3');
  sheet.setCellRaw('B1', '=A1+A2');

  assert.equal(sheet.getCellDisplay('B1'), '5');

  sheet.selectCell('C3');
  assert.equal(sheet.getSelectedCell(), 'C3');
  assert.equal(sheet.getFormulaBarText(), '');

  sheet.selectCell('B1');
  assert.equal(sheet.getFormulaBarText(), '=A1+A2');
});

test('persists raw contents and selection', () => {
  const store = new Map();
  const storage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };

  const first = createSpreadsheet({ rows: 10, cols: 5, storage, storageKeyPrefix: 'persist:' });
  first.setCellRaw('A1', '7');
  first.setCellRaw('B1', '=A1*2');
  first.selectCell('B1');

  const second = createSpreadsheet({ rows: 10, cols: 5, storage, storageKeyPrefix: 'persist:' });

  assert.equal(second.getCellRaw('A1'), '7');
  assert.equal(second.getCellRaw('B1'), '=A1*2');
  assert.equal(second.getCellDisplay('B1'), '14');
  assert.equal(second.getSelectedCell(), 'B1');
});
