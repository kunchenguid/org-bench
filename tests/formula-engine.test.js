const assert = require('assert');

const engine = require('../app.js');

function makeSheet() {
  return engine.createSpreadsheetModel(100, 26);
}

function valueAt(sheet, address) {
  return engine.formatCellValue(engine.evaluateCell(sheet, address));
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('evaluates arithmetic formulas and range functions', () => {
  const sheet = makeSheet();
  engine.setCellRaw(sheet, 'A1', '2');
  engine.setCellRaw(sheet, 'A2', '3');
  engine.setCellRaw(sheet, 'A3', '=SUM(A1:A2)*2');
  engine.setCellRaw(sheet, 'B1', '=AVERAGE(A1:A2)');

  assert.strictEqual(valueAt(sheet, 'A3'), '10');
  assert.strictEqual(valueAt(sheet, 'B1'), '2.5');
});

test('detects circular references without crashing', () => {
  const sheet = makeSheet();
  engine.setCellRaw(sheet, 'A1', '=B1+1');
  engine.setCellRaw(sheet, 'B1', '=A1+1');

  assert.strictEqual(valueAt(sheet, 'A1'), '#CIRC!');
  assert.strictEqual(valueAt(sheet, 'B1'), '#CIRC!');
});

test('copying a relative formula shifts references at the destination', () => {
  const sheet = makeSheet();
  engine.setCellRaw(sheet, 'A1', '7');
  engine.setCellRaw(sheet, 'B1', '=A1*2');

  const copied = engine.adjustFormulaReferences('=A1*2', 'B1', 'B2');
  engine.setCellRaw(sheet, 'A2', '4');
  engine.setCellRaw(sheet, 'B2', copied);

  assert.strictEqual(copied, '=A2*2');
  assert.strictEqual(valueAt(sheet, 'B2'), '8');
});

test('inserting a row keeps formulas pointing at the same data', () => {
  const sheet = makeSheet();
  engine.setCellRaw(sheet, 'A1', '5');
  engine.setCellRaw(sheet, 'A2', '6');
  engine.setCellRaw(sheet, 'B3', '=SUM(A1:A2)');

  engine.insertRows(sheet, 2, 1);

  assert.strictEqual(engine.getCellRaw(sheet, 'B4'), '=SUM(A1:A3)');
  assert.strictEqual(valueAt(sheet, 'B4'), '11');
});
