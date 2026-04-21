const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetController,
} = require('../src/spreadsheet-controller.js');

test('arrow navigation moves one cell and clamps at edges', () => {
  const controller = createSpreadsheetController({ rows: 3, cols: 3 });

  assert.deepEqual(controller.getSelection(), { row: 0, col: 0 });

  controller.handleKeyDown({ key: 'ArrowLeft' });
  assert.deepEqual(controller.getSelection(), { row: 0, col: 0 });

  controller.handleKeyDown({ key: 'ArrowUp' });
  assert.deepEqual(controller.getSelection(), { row: 0, col: 0 });

  controller.handleKeyDown({ key: 'ArrowRight' });
  controller.handleKeyDown({ key: 'ArrowRight' });
  controller.handleKeyDown({ key: 'ArrowRight' });
  assert.deepEqual(controller.getSelection(), { row: 0, col: 2 });

  controller.handleKeyDown({ key: 'ArrowDown' });
  controller.handleKeyDown({ key: 'ArrowDown' });
  controller.handleKeyDown({ key: 'ArrowDown' });
  assert.deepEqual(controller.getSelection(), { row: 2, col: 2 });
});

test('enter starts edit preserving the existing cell contents', () => {
  const controller = createSpreadsheetController({ rows: 3, cols: 3 });
  controller.setCellRaw(0, 0, '42');

  controller.handleKeyDown({ key: 'Enter' });

  assert.equal(controller.isEditing(), true);
  assert.equal(controller.getEditorState().draft, '42');
  assert.equal(controller.getEditorState().source, 'cell');
});

test('f2 and double click start edit preserving current contents', () => {
  const controller = createSpreadsheetController({ rows: 3, cols: 3 });
  controller.setCellRaw(1, 1, 'apple');
  controller.selectCell(1, 1);

  controller.handleKeyDown({ key: 'F2' });
  assert.equal(controller.getEditorState().draft, 'apple');

  controller.cancelEdit();
  controller.doubleClickCell(1, 1);
  assert.equal(controller.getEditorState().draft, 'apple');
});

test('typing replaces the current value, commit with enter writes and moves down', () => {
  const controller = createSpreadsheetController({ rows: 3, cols: 3 });
  controller.setCellRaw(0, 0, 'old');

  controller.handleKeyDown({ key: '9' });
  assert.equal(controller.getEditorState().draft, '9');

  controller.handleEditorInput('98');
  controller.handleEditorKeyDown({ key: 'Enter' });

  assert.equal(controller.getCellRaw(0, 0), '98');
  assert.equal(controller.isEditing(), false);
  assert.deepEqual(controller.getSelection(), { row: 1, col: 0 });
});

test('escape cancels edit and restores the previous value', () => {
  const controller = createSpreadsheetController({ rows: 3, cols: 3 });
  controller.setCellRaw(0, 0, 'seed');

  controller.handleKeyDown({ key: 'Enter' });
  controller.handleEditorInput('changed');
  controller.handleEditorKeyDown({ key: 'Escape' });

  assert.equal(controller.getCellRaw(0, 0), 'seed');
  assert.equal(controller.isEditing(), false);
  assert.deepEqual(controller.getSelection(), { row: 0, col: 0 });
});

test('tab commit writes the draft and moves right', () => {
  const controller = createSpreadsheetController({ rows: 3, cols: 3 });

  controller.handleKeyDown({ key: 'a' });
  controller.handleEditorInput('abc');
  controller.handleEditorKeyDown({ key: 'Tab' });

  assert.equal(controller.getCellRaw(0, 0), 'abc');
  assert.deepEqual(controller.getSelection(), { row: 0, col: 1 });
});

test('formula bar edits use the same raw contents and commit back into the cell', () => {
  const controller = createSpreadsheetController({ rows: 3, cols: 3 });
  controller.setCellRaw(0, 0, '=A1');

  controller.startFormulaBarEdit();
  assert.equal(controller.getEditorState().draft, '=A1');
  assert.equal(controller.getEditorState().source, 'formula');

  controller.handleEditorInput('=A1+B1');
  controller.handleEditorKeyDown({ key: 'Enter' });

  assert.equal(controller.getCellRaw(0, 0), '=A1+B1');
  assert.deepEqual(controller.getSelection(), { row: 1, col: 0 });
});

test('clicking a cell updates the active selection', () => {
  const controller = createSpreadsheetController({ rows: 3, cols: 3 });

  controller.clickCell(2, 1);

  assert.deepEqual(controller.getSelection(), { row: 2, col: 1 });
});
