const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheetController } = require('../spreadsheet-controller');

function createShellDouble() {
  return {
    cells: [],
    renders: 0,
    setCellRaw(cell, raw) {
      this.cells.push({ cell, raw });
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
  assert.equal(shell.renders, 1);
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
