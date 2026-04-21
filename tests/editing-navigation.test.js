const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorkbookStore } = require('../workbook-store.js');
const { createInteractionController } = require('../app.js');

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
    controller: createInteractionController({ store }),
    store,
  };
}

test('arrow navigation moves one cell and clamps to the sheet edges', () => {
  const { controller, store } = createController();

  controller.handleGridKeyDown({ key: 'ArrowLeft' });
  assert.equal(store.getSelection().activeCellId, 'A1');

  controller.handleGridKeyDown({ key: 'ArrowUp' });
  assert.equal(store.getSelection().activeCellId, 'A1');

  controller.handleGridKeyDown({ key: 'ArrowRight' });
  controller.handleGridKeyDown({ key: 'ArrowRight' });
  assert.equal(store.getSelection().activeCellId, 'C1');
});

test('enter and f2 start edit mode with the current raw contents intact', () => {
  const { controller, store } = createController();
  store.commitCell(1, 1, '42');

  controller.handleGridKeyDown({ key: 'Enter' });
  assert.equal(controller.getEditorState().draft, '42');
  controller.cancelEdit();

  controller.handleGridKeyDown({ key: 'F2' });
  assert.equal(controller.getEditorState().draft, '42');
});

test('double click starts editing on the clicked cell', () => {
  const { controller, store } = createController();
  store.commitCell(3, 2, 'hello');

  controller.doubleClickCell(3, 2);

  assert.equal(store.getSelection().activeCellId, 'B3');
  assert.equal(controller.getEditorState().draft, 'hello');
});

test('typing replaces the current value and enter commits then moves down', () => {
  const { controller, store } = createController();
  store.commitCell(1, 1, 'old');

  controller.handleGridKeyDown({ key: '9' });
  controller.handleEditorInput('98');
  controller.handleEditorKeyDown({ key: 'Enter' });

  assert.equal(store.getCell('A1').raw, '98');
  assert.equal(store.getSelection().activeCellId, 'A2');
  assert.equal(controller.isEditing(), false);
});

test('escape cancels edit without mutating the store', () => {
  const { controller, store } = createController();
  store.commitCell(1, 1, 'seed');

  controller.handleGridKeyDown({ key: 'Enter' });
  controller.handleEditorInput('changed');
  controller.handleEditorKeyDown({ key: 'Escape' });

  assert.equal(store.getCell('A1').raw, 'seed');
  assert.equal(store.getSelection().activeCellId, 'A1');
  assert.equal(controller.isEditing(), false);
});

test('tab commits the current edit and moves selection right', () => {
  const { controller, store } = createController();

  controller.handleGridKeyDown({ key: 'a' });
  controller.handleEditorInput('abc');
  controller.handleEditorKeyDown({ key: 'Tab' });

  assert.equal(store.getCell('A1').raw, 'abc');
  assert.equal(store.getSelection().activeCellId, 'B1');
});

test('formula bar editing uses the same store-backed commit flow', () => {
  const { controller, store } = createController();
  store.commitCell(1, 1, '=A1');

  controller.startFormulaBarEdit();
  controller.handleEditorInput('=A1+B1');
  controller.handleEditorKeyDown({ key: 'Enter' });

  assert.equal(store.getCell('A1').raw, '=A1+B1');
  assert.equal(store.getSelection().activeCellId, 'A2');
});
