const test = require('node:test');
const assert = require('node:assert/strict');

const { SpreadsheetGridModel } = require('../src/grid-model.js');

test('starts with A1 selected and not editing', () => {
  const model = new SpreadsheetGridModel();

  assert.deepEqual(model.getSelection(), { row: 1, column: 1 });
  assert.equal(model.isEditing(), false);
});

test('typing starts replace-edit mode for the active cell', () => {
  const model = new SpreadsheetGridModel();

  model.startTyping('7', '42');

  assert.equal(model.isEditing(), true);
  assert.equal(model.getDraft(), '7');
  assert.equal(model.getEditTarget(), 'A1');
});

test('enter starts editing with existing raw contents preserved', () => {
  const model = new SpreadsheetGridModel();

  model.startEditing('=A1+1');

  assert.equal(model.isEditing(), true);
  assert.equal(model.getDraft(), '=A1+1');
});

test('committing with enter returns the draft and moves selection down', () => {
  const model = new SpreadsheetGridModel();

  model.startTyping('9', '');
  const commit = model.commitEdit('enter');

  assert.deepEqual(commit, { address: 'A1', raw: '9' });
  assert.deepEqual(model.getSelection(), { row: 2, column: 1 });
  assert.equal(model.isEditing(), false);
});

test('committing with tab moves selection right', () => {
  const model = new SpreadsheetGridModel();

  model.startTyping('9', '');
  model.commitEdit('tab');

  assert.deepEqual(model.getSelection(), { row: 1, column: 2 });
});

test('escape cancels editing and restores the original raw contents', () => {
  const model = new SpreadsheetGridModel();

  model.startEditing('hello');
  model.updateDraft('changed');

  assert.deepEqual(model.cancelEdit(), { address: 'A1', raw: 'hello' });
  assert.equal(model.isEditing(), false);
});

test('arrow keys move selection when not editing and clamp to grid edges', () => {
  const model = new SpreadsheetGridModel({ rows: 3, columns: 3 });

  model.moveSelection('left');
  assert.deepEqual(model.getSelection(), { row: 1, column: 1 });

  model.moveSelection('right');
  model.moveSelection('right');
  model.moveSelection('right');
  assert.deepEqual(model.getSelection(), { row: 1, column: 3 });

  model.moveSelection('down');
  model.moveSelection('down');
  model.moveSelection('down');
  assert.deepEqual(model.getSelection(), { row: 3, column: 3 });
});

test('tracks a rectangular range when shift-extending selection', () => {
  const model = new SpreadsheetGridModel({ rows: 6, columns: 6 });

  model.extendSelection('right');
  model.extendSelection('down');

  assert.deepEqual(model.getSelection(), { row: 2, column: 2 });
  assert.deepEqual(model.getRange(), {
    start: { row: 1, column: 1 },
    end: { row: 2, column: 2 },
  });
  assert.equal(model.isCellSelected(1, 1), true);
  assert.equal(model.isCellSelected(2, 2), true);
  assert.equal(model.isCellSelected(3, 3), false);
});

test('starting a plain selection clears any existing range anchor', () => {
  const model = new SpreadsheetGridModel({ rows: 6, columns: 6 });

  model.extendSelection('right');
  model.setSelection(4, 4);

  assert.equal(model.getRange(), null);
  assert.deepEqual(model.getSelection(), { row: 4, column: 4 });
});
