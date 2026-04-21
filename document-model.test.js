const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createDocumentModel } = require('./document-model');

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    clear() {
      values.clear();
    },
    get length() {
      return values.size;
    },
    dump() {
      return Array.from(values.entries());
    },
  };
}

test('persists raw cells and selection under a namespaced key', () => {
  const storage = createMemoryStorage();
  const model = createDocumentModel({ storage, namespace: 'oracle:test:' });

  model.setCell('A1', '42');
  model.setCell('B1', '=A1+1');
  model.setSelection('B1');

  const restored = createDocumentModel({ storage, namespace: 'oracle:test:' });
  const keys = storage.dump().map(([key]) => key);

  assert.equal(restored.getCell('A1'), '42');
  assert.equal(restored.getCell('B1'), '=A1+1');
  assert.equal(restored.getSelection(), 'B1');
  assert.deepEqual(keys, ['oracle:test:spreadsheet-document']);
});

test('undo and redo restore a cleared rectangular range as one action', () => {
  const model = createDocumentModel({ storage: createMemoryStorage(), namespace: 'oracle:test:' });

  model.setCell('A1', '1');
  model.setCell('B1', '2');
  model.clearRange({ start: 'A1', end: 'B1' });

  assert.equal(model.getCell('A1'), '');
  assert.equal(model.getCell('B1'), '');

  assert.equal(model.undo(), true);
  assert.equal(model.getCell('A1'), '1');
  assert.equal(model.getCell('B1'), '2');

  assert.equal(model.redo(), true);
  assert.equal(model.getCell('A1'), '');
  assert.equal(model.getCell('B1'), '');
});

test('copy and cut preserve rectangular data and shift relative references on paste', () => {
  const model = createDocumentModel({ storage: createMemoryStorage(), namespace: 'oracle:test:' });

  model.setCell('A1', '5');
  model.setCell('B1', '=A1');

  const copied = model.copyRange({ start: 'B1', end: 'B1' });
  model.pasteRange('C2', copied);

  assert.equal(model.getCell('C2'), '=B2');

  const cut = model.cutRange({ start: 'A1', end: 'B1' });

  assert.equal(model.getCell('A1'), '');
  assert.equal(model.getCell('B1'), '');

  model.pasteRange('A3', cut);

  assert.equal(model.getCell('A3'), '5');
  assert.equal(model.getCell('B3'), '=A3');
});

test('inserting rows and columns updates references so formulas keep pointing at the same data', () => {
  const model = createDocumentModel({ storage: createMemoryStorage(), namespace: 'oracle:test:' });

  model.setCell('A1', '7');
  model.setCell('B1', '=SUM(A1:A2)');

  model.insertRows(1, 1);
  model.insertColumns(1, 1);

  assert.equal(model.getCell('B2'), '7');
  assert.equal(model.getCell('C2'), '=SUM(B2:B3)');
});

test('deleting referenced structure rewrites formulas to #REF! markers', () => {
  const model = createDocumentModel({ storage: createMemoryStorage(), namespace: 'oracle:test:' });

  model.setCell('A1', '7');
  model.setCell('B1', '=A1');

  model.deleteColumns(1, 1);

  assert.equal(model.getCell('A1'), '=#REF!');
});

test('plain script execution exposes createDocumentModel without CommonJS globals', () => {
  const source = fs.readFileSync(path.join(__dirname, 'document-model.js'), 'utf8');
  const context = {
    window: {},
  };

  assert.doesNotThrow(() => {
    vm.runInNewContext(source, context);
  });
  assert.equal(typeof context.window.createDocumentModel, 'function');
});

test('loading persisted cells ignores prototype-polluting keys', () => {
  const storage = createMemoryStorage();
  storage.setItem('oracle:test:spreadsheet-document', JSON.stringify({
    cells: {
      ['__proto__']: 'pollute',
      A1: '42',
    },
    selection: 'A1',
  }));

  const model = createDocumentModel({ storage, namespace: 'oracle:test:' });
  const exported = model.exportState();

  assert.equal(model.getCell('A1'), '42');
  assert.equal(model.getCell('__proto__'), '');
  assert.equal(exported.cells.__proto__, undefined);
  assert.equal(Object.getPrototypeOf(exported.cells), null);
});
