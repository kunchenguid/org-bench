const assert = require('node:assert/strict');
const {
  SpreadsheetEngine,
  indexToColumnLabel,
} = require('../engine.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('indexToColumnLabel maps the first spreadsheet columns', () => {
  assert.equal(indexToColumnLabel(0), 'A');
  assert.equal(indexToColumnLabel(25), 'Z');
  assert.equal(indexToColumnLabel(26), 'AA');
});

test('engine stores raw cell content and evaluates references', () => {
  const engine = new SpreadsheetEngine();
  engine.setCell('A1', '10');
  engine.setCell('A2', '5');
  engine.setCell('B1', '=A1+A2');

  assert.equal(engine.getCellInput('B1'), '=A1+A2');
  assert.equal(engine.getDisplayValue('B1'), '15');
});

test('engine supports aggregate functions and string concatenation', () => {
  const engine = new SpreadsheetEngine();
  engine.setCell('A1', '2');
  engine.setCell('A2', '4');
  engine.setCell('A3', '6');
  engine.setCell('B1', '=SUM(A1:A3)');
  engine.setCell('B2', '="Total: "&B1');

  assert.equal(engine.getDisplayValue('B1'), '12');
  assert.equal(engine.getDisplayValue('B2'), 'Total: 12');
});

test('engine updates dependent formulas after edits', () => {
  const engine = new SpreadsheetEngine();
  engine.setCell('A1', '3');
  engine.setCell('B1', '=A1*2');
  assert.equal(engine.getDisplayValue('B1'), '6');

  engine.setCell('A1', '7');
  assert.equal(engine.getDisplayValue('B1'), '14');
});

test('engine detects circular references', () => {
  const engine = new SpreadsheetEngine();
  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');

  assert.equal(engine.getDisplayValue('A1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
});

test('engine preserves selected cell in serialized state', () => {
  const engine = new SpreadsheetEngine();
  engine.setCell('C3', '=ROUND(3.14159, 2)');
  engine.setSelection({ row: 2, col: 2 });

  const snapshot = engine.serialize();
  const restored = SpreadsheetEngine.fromSnapshot(snapshot);

  assert.equal(restored.getDisplayValue('C3'), '3.14');
  assert.deepEqual(restored.getSelection(), { row: 2, col: 2 });
});
