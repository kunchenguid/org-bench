const assert = require('assert');
const { installClipboardController } = require('../src/clipboardController');
const selectionTools = require('../src/selectionClipboard');

function createTarget() {
  const handlers = {};
  return {
    addEventListener(type, handler) {
      handlers[type] = handlers[type] || new Set();
      handlers[type].add(handler);
    },
    removeEventListener(type, handler) {
      handlers[type].delete(handler);
    },
    dispatch(type, event) {
      (handlers[type] || []).forEach((handler) => handler(event));
    },
  };
}

function createDataTransfer(text) {
  const data = { 'text/plain': text || '' };
  return {
    setData(type, value) {
      data[type] = value;
    },
    getData(type) {
      return data[type] || '';
    },
    data,
  };
}

function createStore() {
  const cells = new Map([
    ['0,0', 'A'],
    ['0,1', '=A1'],
    ['1,0', 'C'],
  ]);
  const calls = [];
  let selection = {
    anchor: { row: 0, col: 0 },
    focus: { row: 1, col: 1 },
    active: { row: 0, col: 0 },
    range: { top: 0, left: 0, bottom: 1, right: 1 },
  };

  return {
    calls,
    cells,
    setSelection(next) {
      selection = next;
    },
    snapshot() {
      return { selection };
    },
    getCellRaw(cell) {
      return cells.get(`${cell.row},${cell.col}`) || '';
    },
    setCellRaw(cell, raw, source) {
      calls.push(['set', cell.row, cell.col, raw, source]);
      cells.set(`${cell.row},${cell.col}`, raw);
    },
    clearRange(range, source) {
      calls.push(['clear', range, source]);
    },
  };
}

function event(overrides) {
  const calls = [];
  return Object.assign({
    preventDefault() {
      calls.push('prevent');
    },
    calls,
  }, overrides || {});
}

function run() {
  const target = createTarget();
  const store = createStore();
  const remove = installClipboardController({ target, store, selectionTools });

  const del = event({ key: 'Delete' });
  target.dispatch('keydown', del);
  assert.deepStrictEqual(store.calls[0], ['clear', { top: 0, left: 0, bottom: 1, right: 1 }, 'range-delete']);
  assert.deepStrictEqual(del.calls, ['prevent']);

  target.dispatch('keydown', event({ key: 'Backspace', target: { tagName: 'INPUT' } }));
  assert.strictEqual(store.calls.length, 1);

  const copyTransfer = createDataTransfer();
  const copy = event({ clipboardData: copyTransfer });
  target.dispatch('copy', copy);
  assert.strictEqual(copyTransfer.data['text/plain'], 'A\t=A1\nC\t');
  assert.deepStrictEqual(copy.calls, ['prevent']);

  const inputPaste = event({ clipboardData: createDataTransfer('text'), target: { tagName: 'TEXTAREA' } });
  target.dispatch('paste', inputPaste);
  assert.deepStrictEqual(inputPaste.calls, []);
  assert.strictEqual(store.calls.length, 1);

  const cutTransfer = createDataTransfer();
  const cut = event({ clipboardData: cutTransfer });
  target.dispatch('cut', cut);
  assert.strictEqual(cutTransfer.data['text/plain'], 'A\t=A1\nC\t');
  assert.deepStrictEqual(store.calls[1], ['clear', { top: 0, left: 0, bottom: 1, right: 1 }, 'range-cut']);

  store.setSelection({
    anchor: { row: 2, col: 2 },
    focus: { row: 2, col: 2 },
    active: { row: 2, col: 2 },
    range: { top: 2, left: 2, bottom: 2, right: 2 },
  });
  const paste = event({ clipboardData: createDataTransfer('=A1\tplain') });
  target.dispatch('paste', paste);
  assert.deepStrictEqual(store.calls.slice(-2), [
    ['set', 2, 2, '=C3', 'range-paste'],
    ['set', 2, 3, 'plain', 'range-paste'],
  ]);

  store.cells.set('1,1', '=A1');
  store.setSelection({
    anchor: { row: 1, col: 1 },
    focus: { row: 1, col: 1 },
    active: { row: 1, col: 1 },
    range: { top: 1, left: 1, bottom: 1, right: 1 },
  });
  const sameAppCopyTransfer = createDataTransfer();
  target.dispatch('copy', event({ clipboardData: sameAppCopyTransfer }));
  store.setSelection({
    anchor: { row: 2, col: 2 },
    focus: { row: 2, col: 2 },
    active: { row: 2, col: 2 },
    range: { top: 2, left: 2, bottom: 2, right: 2 },
  });
  target.dispatch('paste', event({ clipboardData: createDataTransfer(sameAppCopyTransfer.data['text/plain']) }));
  assert.deepStrictEqual(store.calls.slice(-1), [['set', 2, 2, '=B2', 'range-paste']]);

  remove();
  target.dispatch('keydown', event({ key: 'Backspace' }));
  assert.strictEqual(store.calls.length, 5);
}

run();
console.log('clipboard-controller tests passed');
