const assert = require('assert');
const { createEngine, adjustFormulaForPaste } = require('./app.js');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('evaluates arithmetic, ranges, and dependent recalculation', () => {
  const engine = createEngine(10, 10);
  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('A3', '=SUM(A1:A2)*2');
  assert.strictEqual(engine.getDisplay('A3'), '10');
  engine.setCell('A1', '7');
  assert.strictEqual(engine.getDisplay('A3'), '20');
});

test('empty cells display blank but evaluate as zero in formulas', () => {
  const engine = createEngine(10, 10);
  engine.setCell('A1', '=B1+2');
  assert.strictEqual(engine.getDisplay('B1'), '');
  assert.strictEqual(engine.getDisplay('A1'), '2');
});

test('supports comparisons, booleans, IF, and concatenation', () => {
  const engine = createEngine(10, 10);
  engine.setCell('B1', '4');
  engine.setCell('B2', '=IF(B1>=4,"ok "&TRUE,"bad")');
  assert.strictEqual(engine.getDisplay('B2'), 'ok TRUE');
});

test('detects circular references without throwing', () => {
  const engine = createEngine(10, 10);
  engine.setCell('C1', '=C2+1');
  engine.setCell('C2', '=C1+1');
  assert.strictEqual(engine.getDisplay('C1'), '#CIRC!');
  assert.strictEqual(engine.getDisplay('C2'), '#CIRC!');
});

test('adjusts relative references when formulas are pasted', () => {
  assert.strictEqual(adjustFormulaForPaste('=A1+$B$2+C$3+$D4+A1:B2', 2, 1), '=B3+$B$2+D$3+$D6+B3:C4');
});

test('inserting a row keeps formulas pointed at the same data', () => {
  const engine = createEngine(10, 10);
  engine.setCell('A1', '5');
  engine.setCell('A2', '=A1*2');
  engine.insertRow(0);
  assert.strictEqual(engine.getRaw('A3'), '=A2*2');
  assert.strictEqual(engine.getDisplay('A3'), '10');
});
