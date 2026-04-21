const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorkbookState } = require('../workbook-state.js');

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test('stores raw cell contents and selected cell under a namespaced key', () => {
  const storage = new MemoryStorage();
  const workbook = createWorkbookState({ namespace: 'run-123', storage });

  workbook.setCellRaw('B2', '=A1+1');
  workbook.setCellRaw('C3', 'hello');
  workbook.setSelectedCell('C3');

  const persisted = JSON.parse(storage.getItem('run-123:workbook-state:v1'));

  assert.deepEqual(persisted.cells, {
    B2: '=A1+1',
    C3: 'hello',
  });
  assert.equal(persisted.selectedCell, 'C3');
});

test('restores raw cells and selected cell from persisted state', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    'session-a:workbook-state:v1',
    JSON.stringify({
      cells: { A1: '42', D9: '=SUM(A1:A3)' },
      selectedCell: 'D9',
    })
  );

  const workbook = createWorkbookState({ namespace: 'session-a', storage });

  assert.equal(workbook.getCellRaw('A1'), '42');
  assert.equal(workbook.getCellRaw('D9'), '=SUM(A1:A3)');
  assert.equal(workbook.getSelectedCell(), 'D9');
});

test('clears empty raw values instead of persisting blank cells', () => {
  const storage = new MemoryStorage();
  const workbook = createWorkbookState({ namespace: 'blank-test', storage });

  workbook.setCellRaw('A1', 'seed');
  workbook.setCellRaw('A1', '');

  assert.equal(workbook.getCellRaw('A1'), '');
  assert.deepEqual(workbook.getAllCellEntries(), {});
  assert.deepEqual(
    JSON.parse(storage.getItem('blank-test:workbook-state:v1')),
    {
      cells: {},
      selectedCell: 'A1',
    }
  );
});

test('falls back to injected app run namespace globals when one is not passed', () => {
  const storage = new MemoryStorage();
  globalThis.__APPLE_RUN_STORAGE_NAMESPACE__ = 'apple-run';

  try {
    const workbook = createWorkbookState({ storage });
    workbook.setCellRaw('Z1', '9');

    assert.equal(storage.getItem('apple-run:workbook-state:v1') !== null, true);
  } finally {
    delete globalThis.__APPLE_RUN_STORAGE_NAMESPACE__;
  }
});

test('rejects invalid cell references for state plumbing calls', () => {
  const storage = new MemoryStorage();
  const workbook = createWorkbookState({ namespace: 'refs', storage });

  assert.throws(() => workbook.setCellRaw('AA1', 'x'), /Invalid cell reference/);
  assert.throws(() => workbook.setSelectedCell('A0'), /Invalid cell reference/);
});
