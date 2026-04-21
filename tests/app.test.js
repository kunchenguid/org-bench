const assert = require('node:assert/strict');

const {
  createSpreadsheetShellModel,
  columnIndexToLabel,
  createInitialShellState,
  createSpreadsheetEditingController,
} = require('../app.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('columnIndexToLabel returns spreadsheet labels', () => {
  assert.equal(columnIndexToLabel(0), 'A');
  assert.equal(columnIndexToLabel(25), 'Z');
});

test('createSpreadsheetShellModel builds a 26 by 100 grid', () => {
  const model = createSpreadsheetShellModel();

  assert.equal(model.columns.length, 26);
  assert.equal(model.rows.length, 100);
  assert.equal(model.columns[0].label, 'A');
  assert.equal(model.columns[25].label, 'Z');
  assert.equal(model.rows[0].index, 1);
  assert.equal(model.rows[99].index, 100);
  assert.equal(model.rows[0].cells[0].id, 'A1');
  assert.equal(model.rows[99].cells[25].id, 'Z100');
});

test('createInitialShellState exposes clean integration points', () => {
  const state = createInitialShellState();

  assert.deepEqual(state.selection, {
    activeCellId: 'A1',
    anchorCellId: 'A1',
    focusCellId: 'A1',
  });
  assert.equal(state.formulaBarValue, '');
  assert.equal(state.mode, 'navigate');
});

test('controller selects cells and clamps arrow-key navigation to grid bounds', () => {
  const controller = createSpreadsheetEditingController();

  controller.selectCell('C3');
  controller.handleKeyDown({ key: 'ArrowRight' });
  controller.handleKeyDown({ key: 'ArrowDown' });

  assert.equal(controller.getState().selection.activeCellId, 'D4');

  controller.selectCell('A1');
  controller.handleKeyDown({ key: 'ArrowLeft' });
  controller.handleKeyDown({ key: 'ArrowUp' });

  assert.equal(controller.getState().selection.activeCellId, 'A1');
});

test('controller enters edit mode from double-click, Enter, and F2 preserving prior contents', () => {
  const controller = createSpreadsheetEditingController({
    initialState: {
      cells: {
        B2: 'seed',
      },
      selection: {
        activeCellId: 'B2',
        anchorCellId: 'B2',
        focusCellId: 'B2',
      },
    },
  });

  controller.beginEdit();
  assert.equal(controller.getState().draftValue, 'seed');

  controller.cancelEdit();
  controller.handleKeyDown({ key: 'F2' });
  assert.equal(controller.getState().draftValue, 'seed');

  controller.cancelEdit();
  controller.handleKeyDown({ key: 'Enter' });
  assert.equal(controller.getState().draftValue, 'seed');
});

test('typing in navigate mode replaces contents and Escape restores the previous value', () => {
  const controller = createSpreadsheetEditingController({
    initialState: {
      cells: {
        C5: '123',
      },
      selection: {
        activeCellId: 'C5',
        anchorCellId: 'C5',
        focusCellId: 'C5',
      },
    },
  });

  controller.handleTextInput('x');
  assert.equal(controller.getState().mode, 'edit');
  assert.equal(controller.getState().draftValue, 'x');

  controller.cancelEdit();

  assert.equal(controller.getCellRawValue('C5'), '123');
  assert.equal(controller.getState().formulaBarValue, '123');
  assert.equal(controller.getState().mode, 'navigate');
});

test('Enter commits edits and moves selection down while Tab moves right', () => {
  const controller = createSpreadsheetEditingController();

  controller.handleTextInput('42');
  controller.handleKeyDown({ key: 'Enter' });

  assert.equal(controller.getCellRawValue('A1'), '42');
  assert.equal(controller.getState().selection.activeCellId, 'A2');

  controller.handleTextInput('17');
  controller.handleKeyDown({ key: 'Tab' });

  assert.equal(controller.getCellRawValue('A2'), '17');
  assert.equal(controller.getState().selection.activeCellId, 'B2');
});

test('formula bar editing stays in sync with the selected cell', () => {
  const controller = createSpreadsheetEditingController();

  controller.beginFormulaBarEdit();
  controller.updateDraftValue('=A1');
  controller.commitEdit();

  assert.equal(controller.getCellRawValue('A1'), '=A1');
  assert.equal(controller.getState().formulaBarValue, '=A1');

  controller.selectCell('A1');
  assert.equal(controller.getState().formulaBarValue, '=A1');
});
