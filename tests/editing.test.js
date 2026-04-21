const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetStore,
  createMemoryStorage,
} = require('../src/spreadsheet-store.js');
const {
  createEditingController,
  handleClipboardEvent,
  handleClearShortcut,
} = require('../src/editing.js');

function createController() {
  const store = createSpreadsheetStore({
    namespace: 'editing-tests',
    storage: createMemoryStorage(),
  });

  return {
    store,
    controller: createEditingController({ store }),
  };
}

test('typing on the active cell replaces contents and enters edit mode', () => {
  const { controller } = createController();

  controller.replaceSelectionWithText('9');

  assert.equal(controller.getViewModel().editing.active, true);
  assert.equal(controller.getViewModel().editing.draft, '9');
  assert.equal(controller.getFormulaBarText(), '9');
});

test('escape cancels editing and restores the original raw formula', () => {
  const { store, controller } = createController();
  store.setCell('A1', '=A2+1');

  controller.beginEdit({ source: 'cell' });
  controller.updateDraft('=A2+2');
  controller.cancelEdit();

  assert.equal(controller.getViewModel().editing.active, false);
  assert.equal(store.getRawCell('A1'), '=A2+1');
  assert.equal(controller.getFormulaBarText(), '=A2+1');
});

test('enter commits the raw value and moves the selection down', () => {
  const { store, controller } = createController();

  controller.beginEdit({ source: 'cell' });
  controller.updateDraft('42');
  controller.commitEdit({ move: 'down' });

  assert.equal(store.getRawCell('A1'), '42');
  assert.deepEqual(store.getSnapshot().activeCell, { row: 1, col: 0 });
  assert.equal(controller.getViewModel().editing.active, false);
});

test('tab commits and moves the selection right', () => {
  const { store, controller } = createController();

  controller.beginEdit({ source: 'cell' });
  controller.updateDraft('hello');
  controller.commitEdit({ move: 'right' });

  assert.equal(store.getRawCell('A1'), 'hello');
  assert.deepEqual(store.getSnapshot().activeCell, { row: 0, col: 1 });
});

test('formula bar editing writes the same raw text back to the selected cell', () => {
  const { store, controller } = createController();

  store.setCell('B2', '=SUM(A1:A3)');
  controller.selectCell({ row: 1, col: 1 });
  controller.beginEdit({ source: 'formula' });
  controller.updateDraft('=SUM(A1:A4)');
  controller.commitEdit({ move: 'none' });

  assert.equal(store.getRawCell('B2'), '=SUM(A1:A4)');
  assert.equal(controller.getFormulaBarText(), '=SUM(A1:A4)');
});

test('formula bar keeps the raw formula while the cell display comes from computed output', () => {
  const { store, controller } = createController();

  store.setCell('A1', '4');
  store.setCell('B1', '=A1*2');
  controller.selectCell({ row: 0, col: 1 });

  assert.equal(store.getRawCell('B1'), '=A1*2');
  assert.equal(controller.getFormulaBarText(), '=A1*2');
  assert.equal(store.getDisplayCell('B1'), '8');

  store.setCell('A1', '5');

  assert.equal(controller.getFormulaBarText(), '=A1*2');
  assert.equal(store.getDisplayCell('B1'), '10');
});

function createClipboardData() {
  const values = new Map();
  return {
    setData(type, value) {
      values.set(type, String(value));
    },
    getData(type) {
      return values.get(type) || '';
    },
  };
}

function createEvent(type, extra) {
  return {
    type,
    defaultPrevented: false,
    clipboardData: extra && extra.clipboardData,
    key: extra && extra.key,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

test('handleClipboardEvent copies the selected range into clipboard data', () => {
  const { store, controller } = createController();
  const clipboardData = createClipboardData();

  store.applyCells({ A1: '1', B1: '=A1' }, { label: 'seed' });
  store.setSelection({
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 1 },
  });

  const handled = handleClipboardEvent(createEvent('copy', { clipboardData }), {
    store,
    controller,
  });

  assert.equal(handled, true);
  assert.equal(clipboardData.getData('text/plain'), '1\t=A1');
});

test('handleClipboardEvent pastes clipboard payloads into the active selection', () => {
  const { store, controller } = createController();
  const clipboardData = createClipboardData();

  clipboardData.setData('text/plain', '7\t=A1');
  store.setActiveCell({ row: 2, col: 2 });
  store.setSelection({
    anchor: { row: 2, col: 2 },
    focus: { row: 2, col: 2 },
  });

  const handled = handleClipboardEvent(createEvent('paste', { clipboardData }), {
    store,
    controller,
  });

  assert.equal(handled, true);
  assert.equal(store.getRawCell('C3'), '7');
  assert.equal(store.getRawCell('D3'), '=C3');
});

test('handleClearShortcut clears the selected range when not editing', () => {
  const { store, controller } = createController();

  store.applyCells({ A1: '1', A2: '2' }, { label: 'seed' });
  store.setSelection({
    anchor: { row: 0, col: 0 },
    focus: { row: 1, col: 0 },
  });

  const event = createEvent('keydown', { key: 'Delete' });
  const handled = handleClearShortcut(event, { store, controller });

  assert.equal(handled, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(store.getRawCell('A1'), '');
  assert.equal(store.getRawCell('A2'), '');
});
