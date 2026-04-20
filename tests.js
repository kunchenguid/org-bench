const assert = require('assert');
const engine = require('./engine.js');
const storage = require('./storage.js');

function valueOf(result) {
  return result.value;
}

function run() {
  assert.strictEqual(
    storage.resolveStorageNamespace({ __BENCHMARK_STORAGE_NAMESPACE__: 'run-123:' }, {}),
    'run-123:',
    'explicit harness namespace should win'
  );

  assert.strictEqual(
    storage.resolveStorageNamespace(
      { location: { origin: 'file://', pathname: '/tmp/facebook/run/index.html', search: '' } },
      { querySelector: function () { return null; }, documentElement: { dataset: {} }, body: { dataset: {} } }
    ),
    'spreadsheet:file_tmp_facebook_run_index_html:',
    'fallback namespace should derive from the current page path'
  );

  const cells = {
    [engine.keyFromCoord(0, 0)]: '2',
    [engine.keyFromCoord(1, 0)]: '3',
    [engine.keyFromCoord(2, 0)]: '=A1+A2',
    [engine.keyFromCoord(3, 0)]: '=SUM(A1:A3)',
    [engine.keyFromCoord(0, 1)]: 'hello',
    [engine.keyFromCoord(1, 1)]: '="Total: "&A3',
    [engine.keyFromCoord(0, 2)]: '=IF(A3=5,TRUE,FALSE)',
  };

  const evaluator = engine.evaluateSheet(cells, { rows: 10, cols: 10 });
  assert.strictEqual(valueOf(evaluator.evaluateCell(2, 0)), 5, 'formula arithmetic should evaluate');
  assert.strictEqual(valueOf(evaluator.evaluateCell(3, 0)), 10, 'range function should evaluate');
  assert.strictEqual(valueOf(evaluator.evaluateCell(1, 1)), 'Total: 5', 'concat should evaluate');
  assert.strictEqual(valueOf(evaluator.evaluateCell(0, 2)), true, 'comparison inside IF should evaluate');

  const circ = engine.evaluateSheet({ [engine.keyFromCoord(0, 0)]: '=B1', [engine.keyFromCoord(0, 1)]: '=A1' }, { rows: 5, cols: 5 });
  assert.strictEqual(valueOf(circ.evaluateCell(0, 0)), '#CIRC!', 'circular refs should surface');

  assert.strictEqual(engine.shiftFormula('=A1+$B$2+C$3+$D4', 1, 2), '=C2+$B$2+E$3+$D5', 'relative refs should shift while absolute parts stay put');

  const inserted = engine.updateFormulasForStructure({ a: '=A1+B2', b: '=SUM(A1:B2)' }, 'row', 1, 1);
  assert.strictEqual(inserted.a, '=A1+B3', 'row insert should shift refs below insertion point');
  assert.strictEqual(inserted.b, '=SUM(A1:B3)', 'row insert should shift range endpoints');

  const deleted = engine.updateFormulasForStructure({ a: '=A1+B2', b: '=SUM(A1:B2)' }, 'col', 1, -1);
  assert.strictEqual(deleted.a, '=A1+#REF!', 'deleted column refs should become ref errors');
  assert.strictEqual(deleted.b, '=SUM(A1:A2)', 'deleted range should shrink to keep pointing at surviving cells');

  const deletedRowRange = engine.updateFormulasForStructure({ a: '=SUM(A1:A3)' }, 'row', 1, -1);
  assert.strictEqual(deletedRowRange.a, '=SUM(A1:A2)', 'deleted row inside a range should shrink that range');

  const deletedSingleRange = engine.updateFormulasForStructure({ a: '=SUM(B2:B2)' }, 'row', 1, -1);
  assert.strictEqual(deletedSingleRange.a, '=SUM(#REF!)', 'deleting the only cell in a range should surface a ref error');

  const deletedEval = engine.evaluateSheet({ [engine.keyFromCoord(0, 0)]: '=B1+#REF!', [engine.keyFromCoord(0, 1)]: '1' }, { rows: 5, cols: 5 });
  assert.strictEqual(valueOf(deletedEval.evaluateCell(0, 0)), '#REF!', 'error literals should evaluate as spreadsheet errors');
}

run();
console.log('tests passed');
