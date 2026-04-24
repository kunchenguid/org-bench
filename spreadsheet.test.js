const assert = require('assert');
const {
  adjustFormulaReferences,
  applyPaste,
  createEmptyCells,
  formatFormulaStatus,
  getCellKey,
} = require('./app.js');

function cellsWith(values) {
  const cells = createEmptyCells(10, 10);
  for (const [key, value] of Object.entries(values)) cells[key] = value;
  return cells;
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

test('adjusts only relative parts of copied formulas', () => {
  assert.strictEqual(
    adjustFormulaReferences('=A1+$B2+C$3+$D$4', 2, 3),
    '=D3+$B4+F$3+$D$4'
  );
});

test('pasting formula block shifts formulas from each source cell to destination cell', () => {
  const cells = cellsWith({ A1: '=B1', A2: '=B2' });
  const result = applyPaste(cells, {
    source: { startRow: 0, startCol: 0, endRow: 1, endCol: 0 },
    target: { startRow: 0, startCol: 2, endRow: 1, endCol: 2 },
    cut: false,
    maxRows: 10,
    maxCols: 10,
  });

  assert.strictEqual(result[getCellKey(0, 2)], '=D1');
  assert.strictEqual(result[getCellKey(1, 2)], '=D2');
  assert.strictEqual(result[getCellKey(0, 0)], '=B1');
});

test('cut paste moves cells and clears the source block', () => {
  const cells = cellsWith({ A1: '7', A2: '=A1*2' });
  const result = applyPaste(cells, {
    source: { startRow: 0, startCol: 0, endRow: 1, endCol: 0 },
    target: { startRow: 0, startCol: 3, endRow: 1, endCol: 3 },
    cut: true,
    maxRows: 10,
    maxCols: 10,
  });

  assert.strictEqual(result.A1, '');
  assert.strictEqual(result.A2, '');
  assert.strictEqual(result.D1, '7');
  assert.strictEqual(result.D2, '=D1*2');
});

test('formula status exposes evaluated result and error state for selected cell', () => {
  assert.deepStrictEqual(formatFormulaStatus('=A1/0', '#DIV/0!', 'error'), {
    label: 'Value',
    text: '#DIV/0!',
    state: 'error',
  });
  assert.deepStrictEqual(formatFormulaStatus('', '', 'text'), {
    label: 'Ready',
    text: 'Blank',
    state: 'blank',
  });
});
