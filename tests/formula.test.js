const assert = require('assert');

const Spreadsheet = require('../spreadsheet-core.js');

function sheet() {
  return new Spreadsheet.Model(100, 26);
}

function value(model, address) {
  return model.getDisplayValue(Spreadsheet.parseCellAddress(address));
}

function raw(model, address) {
  return model.getRaw(Spreadsheet.parseCellAddress(address));
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('evaluates arithmetic, ranges, booleans, comparisons, and text concatenation', () => {
  const model = sheet();
  model.setRaw(Spreadsheet.parseCellAddress('A1'), '2');
  model.setRaw(Spreadsheet.parseCellAddress('A2'), '3');
  model.setRaw(Spreadsheet.parseCellAddress('A3'), '=SUM(A1:A2)*2');
  model.setRaw(Spreadsheet.parseCellAddress('A4'), '=IF(A3>=10,"Total: "&A3,"low")');
  model.setRaw(Spreadsheet.parseCellAddress('A5'), '=AND(TRUE,A1<A2,NOT(FALSE))');

  assert.strictEqual(value(model, 'A3'), '10');
  assert.strictEqual(value(model, 'A4'), 'Total: 10');
  assert.strictEqual(value(model, 'A5'), 'TRUE');
});

test('detects circular references and divide by zero without crashing', () => {
  const model = sheet();
  model.setRaw(Spreadsheet.parseCellAddress('B1'), '=B2');
  model.setRaw(Spreadsheet.parseCellAddress('B2'), '=B1');
  model.setRaw(Spreadsheet.parseCellAddress('B3'), '=1/0');

  assert.strictEqual(value(model, 'B1'), '#CIRC!');
  assert.strictEqual(value(model, 'B2'), '#CIRC!');
  assert.strictEqual(value(model, 'B3'), '#DIV/0!');
});

test('adjusts relative references when copying formulas', () => {
  const model = sheet();
  model.setRaw(Spreadsheet.parseCellAddress('A1'), '5');
  model.setRaw(Spreadsheet.parseCellAddress('A2'), '=A1+$A$1+A$1+$A1');
  const adjusted = Spreadsheet.adjustFormulaReferences(raw(model, 'A2'), { row: 1, col: 0 }, { row: 1, col: 1 });

  assert.strictEqual(adjusted, '=B1+$A$1+B$1+$A1');
});

test('insert and delete rows keep formulas pointing at moved data or mark deleted references', () => {
  const model = sheet();
  model.setRaw(Spreadsheet.parseCellAddress('A2'), '7');
  model.setRaw(Spreadsheet.parseCellAddress('B1'), '=A2');
  model.insertRow(1);
  assert.strictEqual(raw(model, 'B1'), '=A3');
  assert.strictEqual(value(model, 'B1'), '7');
  model.deleteRow(2);
  assert.strictEqual(raw(model, 'B1'), '=#REF!');
  assert.strictEqual(value(model, 'B1'), '#REF!');
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
  }
}

if (failed) process.exit(1);
