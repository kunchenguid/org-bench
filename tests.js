const assert = require('assert');
const engine = require('./engine.js');

function valueOf(result) {
  return result.value;
}

function run() {
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
  assert.strictEqual(deleted.b, '=SUM(#REF!)', 'deleted range endpoint should become ref error');

  const deletedEval = engine.evaluateSheet({ [engine.keyFromCoord(0, 0)]: '=B1+#REF!', [engine.keyFromCoord(0, 1)]: '1' }, { rows: 5, cols: 5 });
  assert.strictEqual(valueOf(deletedEval.evaluateCell(0, 0)), '#REF!', 'error literals should evaluate as spreadsheet errors');

  const lowercase = engine.evaluateSheet({
    [engine.keyFromCoord(0, 0)]: '2',
    [engine.keyFromCoord(1, 0)]: '3',
    [engine.keyFromCoord(2, 0)]: '=sum(a1:A2)',
    [engine.keyFromCoord(3, 0)]: '=if(a3=5,"ok","no")',
  }, { rows: 5, cols: 5 });
  assert.strictEqual(valueOf(lowercase.evaluateCell(2, 0)), 5, 'lowercase functions and refs should evaluate');
  assert.strictEqual(valueOf(lowercase.evaluateCell(3, 0)), 'ok', 'lowercase formulas should flow through dependent expressions');

  const counted = engine.evaluateSheet({
    [engine.keyFromCoord(0, 0)]: '2',
    [engine.keyFromCoord(1, 0)]: 'hello',
    [engine.keyFromCoord(2, 0)]: '',
    [engine.keyFromCoord(3, 0)]: '=COUNT(A1:C1)',
  }, { rows: 5, cols: 5 });
  assert.strictEqual(valueOf(counted.evaluateCell(3, 0)), 1, 'COUNT should only count numeric values');

  assert.strictEqual(engine.shiftFormula('="A1 stays"&A1', 1, 1), '="A1 stays"&B2', 'copy shifting should not rewrite refs inside strings');

  const rewritten = engine.updateFormulasForStructure({ a: '="A1 stays"&B2' }, 'row', 1, 1);
  assert.strictEqual(rewritten.a, '="A1 stays"&B3', 'structural rewrites should not rewrite refs inside strings');
}

run();
console.log('tests passed');
