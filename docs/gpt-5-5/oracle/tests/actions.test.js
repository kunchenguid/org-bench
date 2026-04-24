const assert = require('assert');
const { createSpreadsheetActions } = require('../src/actions.js');

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    keys() {
      return Array.from(data.keys());
    },
  };
}

function createSheet(initial = {}) {
  const cells = new Map(Object.entries(initial));
  return {
    rows: 100,
    cols: 26,
    active: { row: 0, col: 0 },
    getCell(row, col) {
      return cells.get(`${row},${col}`) || '';
    },
    setCell(row, col, value) {
      const key = `${row},${col}`;
      if (value) cells.set(key, value);
      else cells.delete(key);
    },
    clearCell(row, col) {
      cells.delete(`${row},${col}`);
    },
    resize(rows, cols) {
      this.rows = rows;
      this.cols = cols;
    },
    setActive(row, col) {
      this.active = { row, col };
    },
    snapshot() {
      return Object.fromEntries(cells);
    },
    load(snapshot) {
      cells.clear();
      Object.entries(snapshot.cells || {}).forEach(([key, value]) => cells.set(key, value));
      this.rows = snapshot.rows;
      this.cols = snapshot.cols;
      this.active = snapshot.active;
    },
  };
}

function createActions(sheet, options = {}) {
  return createSpreadsheetActions({
    sheet,
    storage: options.storage || createMemoryStorage(),
    namespace: options.namespace || 'test-run',
    shiftFormulaReferences(formula, source, destination) {
      return `${formula}@${source.row},${source.col}->${destination.row},${destination.col}`;
    },
    transformFormulaForStructureChange(formula, change) {
      return `${formula}|${change.type}:${change.index}:${change.count}`;
    },
  });
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('copy and paste rectangular blocks while shifting formulas relative to destination', () => {
  const sheet = createSheet({
    '0,0': '=A1+B1',
    '0,1': '7',
    '1,0': 'label',
    '1,1': '=SUM(A1:B1)',
  });
  const actions = createActions(sheet);

  actions.copy({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });
  actions.paste({ startRow: 4, startCol: 3, endRow: 4, endCol: 3 });

  assert.deepStrictEqual(sheet.snapshot(), {
    '0,0': '=A1+B1',
    '0,1': '7',
    '1,0': 'label',
    '1,1': '=SUM(A1:B1)',
    '4,3': '=A1+B1@0,0->4,3',
    '4,4': '7',
    '5,3': 'label',
    '5,4': '=SUM(A1:B1)@1,1->5,4',
  });
});

test('cut then paste moves contents and undo restores the source and destination', () => {
  const sheet = createSheet({ '0,0': 'move me', '2,2': 'old' });
  const actions = createActions(sheet);

  actions.cut({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
  actions.paste({ startRow: 2, startCol: 2, endRow: 2, endCol: 2 });

  assert.deepStrictEqual(sheet.snapshot(), { '2,2': 'move me' });

  assert.strictEqual(actions.undo(), true);
  assert.deepStrictEqual(sheet.snapshot(), { '0,0': 'move me', '2,2': 'old' });

  assert.strictEqual(actions.redo(), true);
  assert.deepStrictEqual(sheet.snapshot(), { '2,2': 'move me' });
});

test('clear range is one undoable action', () => {
  const sheet = createSheet({ '0,0': 'a', '0,1': 'b', '1,0': 'c' });
  const actions = createActions(sheet);

  actions.clearRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });
  assert.deepStrictEqual(sheet.snapshot(), {});
  actions.undo();
  assert.deepStrictEqual(sheet.snapshot(), { '0,0': 'a', '0,1': 'b', '1,0': 'c' });
});

test('persistence uses only the injected namespace prefix and restores raw cells plus selection', () => {
  const storage = createMemoryStorage();
  const sheet = createSheet({ '3,4': '=SUM(A1:A3)' });
  sheet.setActive(3, 4);
  const actions = createActions(sheet, { storage, namespace: 'run-42' });

  actions.save();

  assert.deepStrictEqual(storage.keys(), ['run-42:spreadsheet-state']);

  const restored = createSheet();
  const restoredActions = createActions(restored, { storage, namespace: 'run-42' });
  assert.strictEqual(restoredActions.load(), true);
  assert.deepStrictEqual(restored.snapshot(), { '3,4': '=SUM(A1:A3)' });
  assert.deepStrictEqual(restored.active, { row: 3, col: 4 });
});

test('insert and delete row commands shift cells and ask formula API to rewrite formulas', () => {
  const sheet = createSheet({ '0,0': 'header', '1,0': '=A1', '2,0': 'tail' });
  const actions = createActions(sheet);

  actions.insertRows(1, 1);
  assert.deepStrictEqual(sheet.snapshot(), {
    '0,0': 'header',
    '2,0': '=A1|insert-row:1:1',
    '3,0': 'tail',
  });
  assert.strictEqual(sheet.rows, 101);

  actions.deleteRows(0, 1);
  assert.deepStrictEqual(sheet.snapshot(), {
    '1,0': '=A1|insert-row:1:1|delete-row:0:1',
    '2,0': 'tail',
  });
  assert.strictEqual(sheet.rows, 100);
});

test('history retains at least the last 50 actions', () => {
  const sheet = createSheet();
  const actions = createActions(sheet);

  for (let i = 0; i < 55; i += 1) {
    actions.setCell(i, 0, String(i));
  }

  let undoCount = 0;
  while (actions.undo()) undoCount += 1;

  assert.strictEqual(undoCount, 50);
  assert.strictEqual(sheet.getCell(4, 0), '4');
  assert.strictEqual(sheet.getCell(5, 0), '');
});
