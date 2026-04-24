const assert = require('assert');
const { SpreadsheetCore } = require('../app.js');

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

test('recalculates formulas when precedents change', () => {
  const sheet = new SpreadsheetCore(10, 10);
  sheet.setCell('A1', '2');
  sheet.setCell('A2', '3');
  sheet.setCell('B1', '=SUM(A1:A2)*2');
  assert.strictEqual(sheet.getDisplay('B1'), '10');
  sheet.setCell('A1', '5');
  assert.strictEqual(sheet.getDisplay('B1'), '16');
});

test('copying a relative formula shifts references', () => {
  const sheet = new SpreadsheetCore(10, 10);
  sheet.setCell('A1', '7');
  sheet.setCell('B1', '=A1');
  sheet.copyRange({ row: 0, col: 1 }, { row: 0, col: 1 }, { row: 1, col: 1 }, false);
  assert.strictEqual(sheet.getRaw('B2'), '=A2');
});

test('detects circular references without crashing', () => {
  const sheet = new SpreadsheetCore(10, 10);
  sheet.setCell('A1', '=B1');
  sheet.setCell('B1', '=A1');
  assert.strictEqual(sheet.getDisplay('A1'), '#CIRC!');
  assert.strictEqual(sheet.getDisplay('B1'), '#CIRC!');
});

test('inserting a row keeps formulas pointed at the same data', () => {
  const sheet = new SpreadsheetCore(10, 10);
  sheet.setCell('A1', '4');
  sheet.setCell('B1', '=A1*2');
  sheet.insertRow(0);
  assert.strictEqual(sheet.getRaw('B2'), '=A2*2');
  assert.strictEqual(sheet.getDisplay('B2'), '8');
});
