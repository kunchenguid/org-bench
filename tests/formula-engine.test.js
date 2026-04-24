const assert = require('assert');
const { SpreadsheetModel, shiftFormulaReferences } = require('../app.js');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('evaluates arithmetic, ranges, functions, and dependencies', () => {
  const model = new SpreadsheetModel({ rows: 100, cols: 26, storage: null });
  model.setCell('A1', '10');
  model.setCell('A2', '15');
  model.setCell('B1', '=A1+A2*2');
  model.setCell('B2', '=SUM(A1:A2)');
  model.setCell('B3', '=IF(B2>=25,"ok","bad")');

  assert.strictEqual(model.getDisplay('B1'), '40');
  assert.strictEqual(model.getDisplay('B2'), '25');
  assert.strictEqual(model.getDisplay('B3'), 'ok');

  model.setCell('A2', '5');
  assert.strictEqual(model.getDisplay('B1'), '20');
  assert.strictEqual(model.getDisplay('B2'), '15');
  assert.strictEqual(model.getDisplay('B3'), 'bad');
});

test('detects circular references without crashing', () => {
  const model = new SpreadsheetModel({ rows: 100, cols: 26, storage: null });
  model.setCell('A1', '=B1');
  model.setCell('B1', '=A1');
  assert.strictEqual(model.getDisplay('A1'), '#CIRC!');
  assert.strictEqual(model.getDisplay('B1'), '#CIRC!');
});

test('shifts relative references when formulas are pasted', () => {
  assert.strictEqual(shiftFormulaReferences('=A1+$B1+C$2+$D$4+SUM(A1:B2)', 2, 1), '=B3+$B3+D$2+$D$4+SUM(B3:C4)');
});

test('evaluates absolute and mixed cell references', () => {
  const model = new SpreadsheetModel({ rows: 100, cols: 26, storage: null });
  model.setCell('A1', '4');
  model.setCell('B1', '=$A$1+$A1+A$1');
  assert.strictEqual(model.getDisplay('B1'), '12');
});

test('deleted referenced cells render as ref errors', () => {
  const model = new SpreadsheetModel({ rows: 100, cols: 26, storage: null });
  model.setCell('A1', '4');
  model.setCell('B1', '=A1');
  model.deleteCol(0);
  assert.strictEqual(model.getDisplay('A1'), '#REF!');
});

test('undo restores the previous cell contents as one action', () => {
  const model = new SpreadsheetModel({ rows: 100, cols: 26, storage: null });
  model.applyChanges([{ address: 'A1', value: '1' }, { address: 'A2', value: '2' }]);
  model.applyChanges([{ address: 'A1', value: '9' }, { address: 'A2', value: '8' }]);
  assert.strictEqual(model.getRaw('A1'), '9');
  model.undo();
  assert.strictEqual(model.getRaw('A1'), '1');
  assert.strictEqual(model.getRaw('A2'), '2');
  model.redo();
  assert.strictEqual(model.getRaw('A1'), '9');
  assert.strictEqual(model.getRaw('A2'), '8');
});
