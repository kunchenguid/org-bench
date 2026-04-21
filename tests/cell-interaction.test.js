const test = require('node:test');
const assert = require('node:assert/strict');

const { createCellInteractionController } = require('../src/cell-interaction.js');

function createWorkbookState(seed) {
  const cells = { ...(seed && seed.cells ? seed.cells : {}) };
  let selectedCell = seed && seed.selectedCell ? seed.selectedCell : 'A1';

  return {
    getCellRaw(cellId) {
      return cells[cellId] || '';
    },
    setCellRaw(cellId, rawValue) {
      if (rawValue === '') {
        delete cells[cellId];
      } else {
        cells[cellId] = String(rawValue);
      }
      return this.getCellRaw(cellId);
    },
    getSelectedCell() {
      return selectedCell;
    },
    setSelectedCell(cellId) {
      selectedCell = cellId;
      return selectedCell;
    },
  };
}

test('arrow navigation clamps selection to sheet bounds through workbook state', () => {
  const workbookState = createWorkbookState({ selectedCell: 'A1' });
  const controller = createCellInteractionController({ rows: 100, cols: 26, workbookState });

  controller.moveActive(-1, -1);
  assert.deepEqual(controller.getSelection(), { start: 'A1', end: 'A1', active: 'A1' });

  controller.selectCell('Z100');
  controller.moveActive(1, 1);
  assert.deepEqual(controller.getSelection(), { start: 'Z100', end: 'Z100', active: 'Z100' });
});

test('typing replaces the active cell contents and enter commits through workbook state', () => {
  const workbookState = createWorkbookState({
    selectedCell: 'A1',
    cells: { A1: 'stale' },
  });
  const controller = createCellInteractionController({ rows: 100, cols: 26, workbookState });

  controller.startTyping('9');

  assert.equal(controller.getEditorState().draft, '9');
  assert.equal(controller.getFormulaBarValue(), '9');

  controller.commitEdit('down');

  assert.equal(workbookState.getCellRaw('A1'), '9');
  assert.deepEqual(controller.getSelection(), { start: 'A2', end: 'A2', active: 'A2' });
  assert.equal(controller.getFormulaBarValue(), '');
});

test('entering edit mode preserves current contents and escape keeps workbook data unchanged', () => {
  const workbookState = createWorkbookState({
    selectedCell: 'B3',
    cells: { B3: '=A1+A2' },
  });
  const controller = createCellInteractionController({ rows: 100, cols: 26, workbookState });

  controller.beginEdit();
  controller.setDraftValue('temporary');
  controller.cancelEdit();

  assert.equal(workbookState.getCellRaw('B3'), '=A1+A2');
  assert.equal(controller.getFormulaBarValue(), '=A1+A2');
  assert.equal(controller.getEditorState(), null);
});

test('formula bar edits the active cell while still reading live workbook state when not editing', () => {
  const workbookState = createWorkbookState({
    selectedCell: 'D4',
    cells: { D4: '42' },
  });
  const controller = createCellInteractionController({ rows: 100, cols: 26, workbookState });

  assert.equal(controller.getFormulaBarValue(), '42');
  workbookState.setCellRaw('D4', '=A1');
  assert.equal(controller.getFormulaBarValue(), '=A1');

  controller.beginEdit('formula-bar');
  controller.setDraftValue('=B2');
  controller.commitEdit('right');

  assert.equal(workbookState.getCellRaw('D4'), '=B2');
  assert.deepEqual(controller.getSelection(), { start: 'E4', end: 'E4', active: 'E4' });
});
