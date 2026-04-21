const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorkbookStore } = require('../workbook-store.js');
const { createEditController } = require('../app.js');

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

function createController() {
  const store = createWorkbookStore({
    namespace: 'apple-run',
    storage: createMemoryStorage(),
  });

  return {
    controller: createEditController({ store }),
    store,
  };
}

test('typing replaces the active cell and enter commits then moves down', () => {
  const { controller, store } = createController();

  controller.handleGridKeyDown({ key: '5' });
  controller.handleEditorKeyDown({ key: 'Enter' });

  assert.equal(store.getCell('A1').raw, '5');
  assert.equal(store.getSelection().activeCellId, 'A2');
});

test('tab commits the draft and moves right', () => {
  const { controller, store } = createController();

  controller.handleGridKeyDown({ key: '7' });
  controller.handleEditorInput('72');
  controller.handleEditorKeyDown({ key: 'Tab' });

  assert.equal(store.getCell('A1').raw, '72');
  assert.equal(store.getSelection().activeCellId, 'B1');
});

test('formula bar edit starts from the active raw value and stays in sync with the draft', () => {
  const { controller, store } = createController();
  store.commitCell(1, 1, '=A2');
  store.selectCell(1, 1);

  controller.startFormulaBarEdit();
  assert.equal(controller.getEditorState().draft, '=A2');

  controller.handleEditorInput('=A2+1');
  controller.handleEditorKeyDown({ key: 'Enter' });

  assert.equal(store.getCell('A1').raw, '=A2+1');
  assert.equal(store.getSelection().activeCellId, 'A2');
});
