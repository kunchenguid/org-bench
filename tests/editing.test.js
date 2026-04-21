const assert = require('node:assert/strict');

const { createSpreadsheetEditingController } = require('../editing.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

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

test('controller enters edit mode from begin edit, Enter, and F2 preserving prior contents', () => {
  const controller = createSpreadsheetEditingController({
    cells: { B2: 'seed' },
    activeCellId: 'B2',
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
    cells: { C5: '123' },
    activeCellId: 'C5',
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

test('commit uses provided cell hooks and exposes display values for the grid', () => {
  const committed = new Map();
  const controller = createSpreadsheetEditingController({
    getCell: (cellId) => committed.get(cellId) || { raw: '', display: '' },
    commitCell: (cellId, raw) => {
      committed.set(cellId, {
        raw,
        display: raw === '=1+2' ? '3' : raw,
      });
    },
  });

  controller.beginFormulaBarEdit();
  controller.updateDraftValue('=1+2');
  controller.commitEdit('down');

  assert.deepEqual(committed.get('A1'), {
    raw: '=1+2',
    display: '3',
  });
  assert.equal(controller.getCellRawValue('A1'), '=1+2');
  assert.equal(controller.getCellDisplayValue('A1'), '3');
  assert.equal(controller.getState().selection.activeCellId, 'A2');
});

test('controller restores cells and selection from persistence on startup', () => {
  const persistence = {
    load() {
      return {
        cells: { B2: 'restored value' },
        selection: { col: 2, row: 2 },
      };
    },
    save() {},
  };

  const controller = createSpreadsheetEditingController({ persistence });

  assert.equal(controller.getCellRawValue('B2'), 'restored value');
  assert.equal(controller.getState().selection.activeCellId, 'B2');
  assert.equal(controller.getState().formulaBarValue, 'restored value');
});

test('controller persists committed edits and the resulting selection', () => {
  const saves = [];
  const persistence = {
    load() {
      return {
        cells: {},
        selection: null,
      };
    },
    save(state) {
      saves.push(state);
    },
  };

  const controller = createSpreadsheetEditingController({ persistence });

  controller.handleTextInput('42');
  controller.handleKeyDown({ key: 'Enter' });

  assert.deepEqual(saves.at(-1), {
    cells: { A1: '42' },
    selection: { col: 1, row: 2 },
  });
});

test('controller persists selection-only changes outside edit mode', () => {
  const saves = [];
  const persistence = {
    load() {
      return {
        cells: {},
        selection: null,
      };
    },
    save(state) {
      saves.push(state);
    },
  };

  const controller = createSpreadsheetEditingController({ persistence });

  controller.selectCell('C3');

  assert.deepEqual(saves.at(-1), {
    cells: {},
    selection: { col: 3, row: 3 },
  });
});
