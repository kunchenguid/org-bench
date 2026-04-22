const assert = require('node:assert/strict');

const { retargetFormulaBarEdit, shouldRenderCellEditor } = require('../app-state.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('retargets formula bar edits to the newly selected cell', () => {
  const next = retargetFormulaBarEdit({
    coord: 'A1',
    value: '=1+2',
    original: '=1+2',
    source: 'formula',
  }, 'B2', (coord) => ({ A1: '=1+2', B2: '=SUM(A1:A3)' }[coord] || ''));

  assert.deepEqual(next, {
    coord: 'B2',
    value: '=SUM(A1:A3)',
    original: '=SUM(A1:A3)',
    source: 'formula',
  });
});

test('leaves non-formula-bar editing state alone when nothing is being edited', () => {
  assert.equal(retargetFormulaBarEdit(null, 'C3', () => '7'), null);
});

test('ignores cell-editor sessions', () => {
  assert.equal(retargetFormulaBarEdit({
    coord: 'A1',
    value: '7',
    original: '7',
    source: 'cell',
  }, 'B2', () => '9'), null);
});

test('does not render an in-cell editor for formula-bar sessions', () => {
  assert.equal(shouldRenderCellEditor({ coord: 'B1', source: 'formula' }, 'B1'), false);
});

test('renders an in-cell editor for direct cell sessions', () => {
  assert.equal(shouldRenderCellEditor({ coord: 'B1', source: 'cell' }, 'B1'), true);
});
