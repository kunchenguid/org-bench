const test = require('node:test');
const assert = require('node:assert/strict');

const { createCellInteractionController } = require('../src/cell-interaction.js');

test('arrow navigation clamps to sheet bounds when not editing', () => {
  const controller = createCellInteractionController({ rows: 100, cols: 26 });

  controller.moveActive(-1, -1);
  assert.deepEqual(controller.getSelection(), {
    start: { row: 1, col: 1 },
    end: { row: 1, col: 1 },
    active: { row: 1, col: 1 },
  });

  controller.selectCell(100, 26);
  controller.moveActive(1, 1);
  assert.deepEqual(controller.getSelection(), {
    start: { row: 100, col: 26 },
    end: { row: 100, col: 26 },
    active: { row: 100, col: 26 },
  });
});

test('typing replaces the active cell contents and enter commits moving downward', () => {
  const controller = createCellInteractionController({
    rows: 100,
    cols: 26,
    cells: { '1,1': 'stale' },
  });

  controller.startTyping('9');

  assert.equal(controller.getEditorState().draft, '9');
  assert.equal(controller.getFormulaBarValue(), '9');

  controller.commitEdit('down');

  assert.equal(controller.getCellValue(1, 1), '9');
  assert.deepEqual(controller.getSelection().active, { row: 2, col: 1 });
  assert.equal(controller.getFormulaBarValue(), '');
});

test('entering edit mode preserves current contents and escape restores them', () => {
  const controller = createCellInteractionController({
    rows: 100,
    cols: 26,
    cells: { '3,2': '=A1+A2' },
  });

  controller.selectCell(3, 2);
  controller.beginEdit();
  controller.setDraftValue('temporary');

  assert.equal(controller.getFormulaBarValue(), 'temporary');

  controller.cancelEdit();

  assert.equal(controller.getCellValue(3, 2), '=A1+A2');
  assert.equal(controller.getFormulaBarValue(), '=A1+A2');
  assert.equal(controller.getEditorState(), null);
});

test('formula bar edits the active cell and tab commits moving right', () => {
  const controller = createCellInteractionController({
    rows: 100,
    cols: 26,
    cells: { '4,4': '42' },
  });

  controller.selectCell(4, 4);
  controller.beginEdit('formula-bar');
  controller.setDraftValue('=A1');
  controller.commitEdit('right');

  assert.equal(controller.getCellValue(4, 4), '=A1');
  assert.deepEqual(controller.getSelection().active, { row: 4, col: 5 });
  assert.equal(controller.getFormulaBarValue(), '');
});
