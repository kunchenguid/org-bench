const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetModel,
  createFormulaEngine,
  makeCellKey,
} = require('../src/spreadsheet.js');

test('formula engine evaluates arithmetic, references, and SUM ranges', () => {
  const engine = createFormulaEngine();
  const rawCells = new Map([
    ['A1', '10'],
    ['A2', '15'],
    ['B1', '=A1+A2'],
    ['B2', '=SUM(A1:A2)'],
  ]);

  const snapshot = engine.evaluateAll(rawCells);

  assert.equal(snapshot.get('B1').display, '25');
  assert.equal(snapshot.get('B2').display, '25');
});

test('formula engine detects direct circular references', () => {
  const engine = createFormulaEngine();
  const rawCells = new Map([
    ['A1', '=B1'],
    ['B1', '=A1'],
  ]);

  const snapshot = engine.evaluateAll(rawCells);

  assert.equal(snapshot.get('A1').display, '#CIRC!');
  assert.equal(snapshot.get('B1').display, '#CIRC!');
});

test('spreadsheet model commits edits, moves selection, and persists raw formulas', () => {
  const storage = new Map();
  const model = createSpreadsheetModel({
    columns: 4,
    rows: 4,
    storage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    storageKey: 'ns:sheet',
  });

  model.commitCell('A1', '12');
  model.commitCell('A2', '18');
  model.selectCell('B1');
  model.commitCell('B1', '=A1+A2', { move: 'down' });

  assert.equal(model.getCell('B1').raw, '=A1+A2');
  assert.equal(model.getCell('B1').display, '30');
  assert.equal(model.getSelection().activeCell, 'B2');

  const restored = createSpreadsheetModel({
    columns: 4,
    rows: 4,
    storage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    storageKey: 'ns:sheet',
  });

  assert.equal(restored.getCell('B1').raw, '=A1+A2');
  assert.equal(restored.getCell('B1').display, '30');
  assert.equal(restored.getSelection().activeCell, 'B2');
});

test('spreadsheet model undoes and redoes committed edits as single actions', () => {
  const model = createSpreadsheetModel({
    columns: 4,
    rows: 4,
  });

  model.commitCell('A1', '12');
  model.commitCell('A1', '18');

  model.undo();
  assert.equal(model.getCell('A1').display, '12');

  model.redo();
  assert.equal(model.getCell('A1').display, '18');
});

test('undo restores cleared formulas and redo reapplies the clear', () => {
  const model = createSpreadsheetModel({
    columns: 4,
    rows: 4,
  });

  model.commitCell('A1', '12');
  model.commitCell('B1', '=A1*2');

  model.clearCell('A1');
  assert.equal(model.getCell('A1').display, '');
  assert.equal(model.getCell('B1').display, '0');

  model.undo();
  assert.equal(model.getCell('A1').display, '12');
  assert.equal(model.getCell('B1').display, '24');

  model.redo();
  assert.equal(model.getCell('A1').display, '');
  assert.equal(model.getCell('B1').display, '0');
});

test('cell keys are generated from zero-based row and column indexes', () => {
  assert.equal(makeCellKey(0, 0), 'A1');
  assert.equal(makeCellKey(4, 25), 'Z5');
});
