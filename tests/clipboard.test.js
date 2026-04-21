const test = require('node:test');
const assert = require('node:assert/strict');

const {
  selectionFromEndpoints,
  clearSelectedCells,
  copySelection,
  pasteSelection,
  getFormulaTranslator,
  commitRangeClear,
  commitClipboardPaste,
} = require('../src/clipboard.js');

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

test('getFormulaTranslator prefers the merged SpreadsheetFormulaEngine export', () => {
  const calls = [];
  const translator = getFormulaTranslator({
    SpreadsheetFormulaEngine: {
      translateFormula(raw, source, target) {
        calls.push({ raw, source, target });
        return '=translated';
      },
    },
  });

  assert.equal(translator('=A1', 'A1', 'B2'), '=translated');
  assert.deepEqual(calls, [{ raw: '=A1', source: 'A1', target: 'B2' }]);
});

test('commitRangeClear writes through runtime commit so history and persistence observe the change', () => {
  const calls = [];
  const runtime = {
    getState() {
      return {
        cells: { A1: '1', B1: '2', C1: 'keep' },
        selection: { row: 1, col: 1 },
      };
    },
    commit(nextState, source) {
      calls.push({ nextState, source });
      return nextState;
    },
  };

  const selection = selectionFromEndpoints({ row: 0, column: 0 }, { row: 0, column: 1 });
  const committed = commitRangeClear(runtime, selection, 'clipboard:clear');

  assert.deepEqual(committed, {
    cells: { C1: 'keep' },
    selection: { row: 1, col: 2 },
  });
  assert.deepEqual(calls, [{
    nextState: {
      cells: { C1: 'keep' },
      selection: { row: 1, col: 2 },
    },
    source: 'clipboard:clear',
  }]);
});

test('commitClipboardPaste writes pasted cells through runtime commit and returns the next UI selection', () => {
  const calls = [];
  const runtime = {
    getState() {
      return {
        cells: { A1: '1', B1: '=A1' },
        selection: { row: 1, col: 1 },
      };
    },
    commit(nextState, source) {
      calls.push({ nextState, source });
      return nextState;
    },
  };

  const clipboard = copySelection(
    { A1: '1', B1: '=A1' },
    selectionFromEndpoints({ row: 0, column: 0 }, { row: 0, column: 1 }),
    'copy'
  );

  const result = commitClipboardPaste({
    runtime,
    selection: selectionFromEndpoints({ row: 2, column: 2 }, { row: 2, column: 2 }),
    clipboard,
    translateFormula(raw, source, target) {
      assert.equal(raw, '=A1');
      assert.equal(source, 'B1');
      assert.equal(target, 'D3');
      return '=C3';
    },
    source: 'clipboard:paste',
  });

  assert.deepEqual(result.state, {
    cells: {
      A1: '1',
      B1: '=A1',
      C3: '1',
      D3: '=C3',
    },
    selection: { row: 3, col: 3 },
  });
  assert.deepEqual(result.selection.active, { row: 2, column: 2 });
  assert.deepEqual(calls, [{
    nextState: {
      cells: {
        A1: '1',
        B1: '=A1',
        C3: '1',
        D3: '=C3',
      },
      selection: { row: 3, col: 3 },
    },
    source: 'clipboard:paste',
  }]);
});
