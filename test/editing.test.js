const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetStore,
  beginEdit,
  applyTypedInput,
  updateEditDraft,
  commitEdit,
  cancelEdit,
  getCellRaw,
  getFormulaBarText,
} = require('../src/editing.js');

test('typing on a selected cell replaces contents and enters edit mode', () => {
  const store = createSpreadsheetStore();

  applyTypedInput(store, '9');

  assert.equal(store.editing.active, true);
  assert.equal(store.editing.source, 'cell');
  assert.equal(store.editing.draft, '9');
  assert.equal(getFormulaBarText(store), '9');
});

test('escape cancels an in-progress edit and restores previous raw value', () => {
  const store = createSpreadsheetStore();
  store.cells.A1 = { raw: '=A2+1' };

  beginEdit(store, { cellId: 'A1', source: 'cell' });
  updateEditDraft(store, '=A2+2');
  cancelEdit(store);

  assert.equal(store.editing.active, false);
  assert.equal(getCellRaw(store, 'A1'), '=A2+1');
  assert.equal(getFormulaBarText(store), '=A2+1');
});

test('enter commits and moves selection down', () => {
  const store = createSpreadsheetStore();

  beginEdit(store, { cellId: 'A1', source: 'cell' });
  updateEditDraft(store, '42');
  commitEdit(store, { move: 'down' });

  assert.equal(getCellRaw(store, 'A1'), '42');
  assert.equal(store.selection.activeCellId, 'A2');
  assert.equal(store.editing.active, false);
});

test('tab commits and moves selection right', () => {
  const store = createSpreadsheetStore();

  beginEdit(store, { cellId: 'A1', source: 'cell' });
  updateEditDraft(store, 'Hello');
  commitEdit(store, { move: 'right' });

  assert.equal(getCellRaw(store, 'A1'), 'Hello');
  assert.equal(store.selection.activeCellId, 'B1');
});

test('formula bar editing is equivalent to cell editing and preserves raw formulas', () => {
  const store = createSpreadsheetStore();
  store.cells.B2 = { raw: '=SUM(A1:A3)' };
  store.selection.activeCellId = 'B2';

  beginEdit(store, { source: 'formula' });
  assert.equal(getFormulaBarText(store), '=SUM(A1:A3)');

  updateEditDraft(store, '=SUM(A1:A4)');
  commitEdit(store, { move: 'none' });

  assert.equal(getCellRaw(store, 'B2'), '=SUM(A1:A4)');
  assert.equal(getFormulaBarText(store), '=SUM(A1:A4)');
});

test('enter can open edit mode preserving current contents', () => {
  const store = createSpreadsheetStore();
  store.cells.C3 = { raw: 'keep me' };
  store.selection.activeCellId = 'C3';

  beginEdit(store, { source: 'cell' });

  assert.equal(store.editing.active, true);
  assert.equal(store.editing.draft, 'keep me');
});
