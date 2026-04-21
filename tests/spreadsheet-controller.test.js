const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheetController } = require('../spreadsheet-controller');

function createShellDouble() {
  return {
    cells: [],
    current: {},
    renders: 0,
    activeCell: null,
    setCellRaw(cell, raw) {
      this.cells.push({ cell, raw });
      this.current[cell.col + ':' + cell.row] = raw;
    },
    setActiveCell(cell) {
      this.activeCell = cell;
    },
    rerender() {
      this.renders += 1;
    },
  };
}

test('hydrates display values from model through the formula engine', () => {
  const shell = createShellDouble();
  const model = {
    exportState() {
      return {
        cells: {
          A1: '2',
          A2: '=A1+3',
        },
        selection: 'A2',
      };
    },
  };
  const engine = {
    cells: new Map(),
    setCell(cellId, raw) {
      this.cells.set(cellId, raw);
    },
    recalculate() {},
    getDisplayValue(cellId) {
      return cellId === 'A2' ? 5 : this.cells.get(cellId);
    },
  };

  const controller = createSpreadsheetController({ shell, model, engine });

  controller.hydrate();

  assert.deepEqual(shell.cells, [
    { cell: { col: 0, row: 0 }, raw: '2' },
    { cell: { col: 0, row: 1 }, raw: '5' },
  ]);
  assert.deepEqual(shell.activeCell, { col: 0, row: 1 });
  assert.equal(shell.renders, 1);
});

test('hydrate clears previously rendered cells that are no longer present in the model snapshot', () => {
  const shell = createShellDouble();
  let modelState = {
    cells: {
      A1: '2',
      B1: '3',
    },
    selection: 'A1',
  };
  const model = {
    exportState() {
      return JSON.parse(JSON.stringify(modelState));
    },
  };
  const engine = {
    cells: new Map(),
    setCell(cellId, raw) {
      this.cells.set(cellId, raw);
    },
    recalculate() {},
    getDisplayValue(cellId) {
      return this.cells.get(cellId);
    },
  };

  const controller = createSpreadsheetController({ shell, model, engine });

  controller.hydrate();
  modelState = {
    cells: {
      A1: '2',
    },
    selection: 'A1',
  };
  shell.cells = [];

  controller.hydrate();

  assert.deepEqual(shell.cells, [
    { cell: { col: 1, row: 0 }, raw: '' },
    { cell: { col: 0, row: 0 }, raw: '2' },
  ]);
  assert.equal(shell.current['1:0'], '');
});

test('committing a raw value persists it and rerenders dependents with display values', () => {
  const shell = createShellDouble();
  const writes = [];
  const modelState = {
    cells: {
      A1: '1',
      B1: '=A1+1',
    },
    selection: 'A1',
  };
  const model = {
    setCell(cellId, raw) {
      writes.push({ cellId, raw });
      modelState.cells[cellId] = raw;
    },
    exportState() {
      return JSON.parse(JSON.stringify(modelState));
    },
  };
  const engine = {
    cells: new Map(),
    setCell(cellId, raw) {
      this.cells.set(cellId, raw);
    },
    recalculate() {},
    getDisplayValue(cellId) {
      if (cellId === 'B1') return 8;
      return this.cells.get(cellId);
    },
  };

  const controller = createSpreadsheetController({ shell, model, engine });

  controller.commitCell({ col: 0, row: 0 }, '7');

  assert.deepEqual(writes, [{ cellId: 'A1', raw: '7' }]);
  assert.deepEqual(shell.cells, [
    { cell: { col: 0, row: 0 }, raw: '7' },
    { cell: { col: 1, row: 0 }, raw: '8' },
  ]);
  assert.equal(shell.renders, 1);
});

test('clearing a range persists it through the model and rerenders empty display cells', () => {
  const shell = createShellDouble();
  const cleared = [];
  const modelState = {
    cells: {
      A1: '1',
      B1: '2',
    },
    selection: 'A1',
  };
  const model = {
    clearRange(range) {
      cleared.push(range);
      delete modelState.cells.A1;
      delete modelState.cells.B1;
    },
    exportState() {
      return JSON.parse(JSON.stringify(modelState));
    },
  };
  const engine = {
    cells: new Map(),
    setCell(cellId, raw) {
      this.cells.set(cellId, raw);
    },
    recalculate() {},
    getDisplayValue(cellId) {
      return this.cells.get(cellId) || '';
    },
  };

  const controller = createSpreadsheetController({ shell, model, engine });

  controller.hydrate();
  shell.cells = [];
  controller.clearRange({ start: { col: 0, row: 0 }, end: { col: 1, row: 0 } });

  assert.deepEqual(cleared, [{ start: 'A1', end: 'B1' }]);
  assert.deepEqual(shell.cells, [
    { cell: { col: 0, row: 0 }, raw: '' },
    { cell: { col: 1, row: 0 }, raw: '' },
  ]);
});

test('structure actions map shell coordinates onto one-based model operations', () => {
  const shell = createShellDouble();
  const operations = [];
  const model = {
    insertRows(index, count) {
      operations.push(['insertRows', index, count]);
    },
    deleteColumns(index, count) {
      operations.push(['deleteColumns', index, count]);
    },
    exportState() {
      return { cells: {}, selection: 'A1' };
    },
  };
  const engine = {
    cells: new Map(),
    setCell() {},
    recalculate() {},
    getDisplayValue() {
      return '';
    },
  };

  const controller = createSpreadsheetController({ shell, model, engine });

  controller.applyStructureChange({ axis: 'row', action: 'insert-after', index: 4 });
  controller.applyStructureChange({ axis: 'col', action: 'delete', index: 2 });

  assert.deepEqual(operations, [
    ['insertRows', 6, 1],
    ['deleteColumns', 3, 1],
  ]);
  assert.equal(shell.renders, 2);
});

test('selection updates are persisted back to the model as A1-style addresses', () => {
  const shell = createShellDouble();
  const selections = [];
  const model = {
    setSelection(cellId) {
      selections.push(cellId);
    },
    exportState() {
      return { cells: {}, selection: 'A1' };
    },
  };
  const engine = {
    cells: new Map(),
    setCell() {},
    recalculate() {},
    getDisplayValue() {
      return '';
    },
  };

  const controller = createSpreadsheetController({ shell, model, engine });

  controller.setSelection({ col: 2, row: 4 });

  assert.deepEqual(selections, ['C5']);
});

test('hydrate sends raw formulas and display values separately when the shell supports cell data updates', () => {
  const calls = [];
  const shell = {
    renders: 0,
    setCellData(cell, raw, display) {
      calls.push({ cell, raw, display });
    },
    rerender() {
      this.renders += 1;
    },
  };
  const model = {
    exportState() {
      return {
        cells: {
          A1: '=1+2',
        },
        selection: 'A1',
      };
    },
  };
  const engine = {
    cells: new Map(),
    setCell(cellId, raw) {
      this.cells.set(cellId, raw);
    },
    recalculate() {},
    getDisplayValue() {
      return 3;
    },
  };

  const controller = createSpreadsheetController({ shell, model, engine });

  controller.hydrate();

  assert.deepEqual(calls, [
    { cell: { col: 0, row: 0 }, raw: '=1+2', display: '3' },
  ]);
  assert.equal(shell.renders, 1);
});
