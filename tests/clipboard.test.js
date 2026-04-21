const test = require('node:test');
const assert = require('node:assert/strict');

const {
  selectionFromEndpoints,
  clearSelectedCells,
  copySelection,
  pasteSelection,
} = require('../app.js');

test('copySelection serializes the selected rectangle as tab-delimited text', () => {
  const selection = selectionFromEndpoints({ row: 1, column: 1 }, { row: 2, column: 2 });
  const result = copySelection(
    {
      B2: '1',
      C2: '2',
      B3: '3',
      C3: '=A1+B1',
    },
    selection,
    'copy'
  );

  assert.equal(result.text, '1\t2\n3\t=A1+B1');
  assert.equal(result.payload.mode, 'copy');
  assert.deepEqual(result.payload.selection, {
    minRow: 1,
    maxRow: 2,
    minColumn: 1,
    maxColumn: 2,
  });
});

test('clearSelectedCells removes every populated cell in the active range', () => {
  const selection = selectionFromEndpoints({ row: 0, column: 0 }, { row: 1, column: 1 });

  assert.deepEqual(
    clearSelectedCells(
      {
        A1: 'keep?',
        B1: 'gone',
        A2: 'gone',
        B2: 'gone',
        C3: 'stay',
      },
      selection
    ),
    { C3: 'stay' }
  );
});

test('pasteSelection pastes a copied block into the target top-left and shifts formulas relatively', () => {
  const copiedSelection = selectionFromEndpoints({ row: 0, column: 0 }, { row: 1, column: 1 });
  const targetSelection = selectionFromEndpoints({ row: 2, column: 2 }, { row: 2, column: 2 });

  const result = pasteSelection({
    cells: {
      A1: '1',
      B1: '=A1',
      A2: '3',
      B2: '=$A1',
      F6: 'stay',
    },
    targetSelection,
    clipboard: copySelection(
      {
        A1: '1',
        B1: '=A1',
        A2: '3',
        B2: '=$A1',
      },
      copiedSelection,
      'copy'
    ),
    translateFormula(raw, source, target) {
      if (raw === '=A1') {
        assert.equal(source, 'B1');
        assert.equal(target, 'D3');
        return '=C3';
      }
      if (raw === '=$A1') {
        assert.equal(source, 'B2');
        assert.equal(target, 'D4');
        return '=$A3';
      }
      return raw;
    },
  });

  assert.deepEqual(result.cells, {
    A1: '1',
    B1: '=A1',
    A2: '3',
    B2: '=$A1',
    C3: '1',
    D3: '=C3',
    C4: '3',
    D4: '=$A3',
    F6: 'stay',
  });
  assert.deepEqual(result.selection.active, { row: 2, column: 2 });
  assert.equal(result.cutCleared, false);
});

test('pasteSelection clears the cut source after moving the block', () => {
  const selection = selectionFromEndpoints({ row: 0, column: 0 }, { row: 0, column: 1 });
  const clipboard = copySelection(
    {
      A1: 'left',
      B1: 'right',
      C2: 'stay',
    },
    selection,
    'cut'
  );

  const result = pasteSelection({
    cells: {
      A1: 'left',
      B1: 'right',
      C2: 'stay',
    },
    targetSelection: selectionFromEndpoints({ row: 2, column: 0 }, { row: 2, column: 0 }),
    clipboard,
    translateFormula(raw) {
      return raw;
    },
  });

  assert.deepEqual(result.cells, {
    A3: 'left',
    B3: 'right',
    C2: 'stay',
  });
  assert.equal(result.cutCleared, true);
});
