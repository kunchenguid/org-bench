const assert = require('assert');
const Engine = require('../engine.js');

function makeEngine() {
  return new Engine.SpreadsheetEngine(26, 100);
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

test('evaluates arithmetic formulas and recomputes dependents', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '2');
  sheet.setCell('A2', '3');
  sheet.setCell('A3', '=A1+A2*4');
  assert.strictEqual(sheet.getDisplay('A3'), '14');
  sheet.setCell('A2', '5');
  assert.strictEqual(sheet.getDisplay('A3'), '22');
});

test('evaluates ranges and common functions', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '1');
  sheet.setCell('A2', '2');
  sheet.setCell('A3', '3');
  sheet.setCell('B1', '=SUM(A1:A3)');
  sheet.setCell('B2', '=AVERAGE(A1:A3)');
  sheet.setCell('B3', '=IF(B1>5,"big","small")');
  assert.strictEqual(sheet.getDisplay('B1'), '6');
  assert.strictEqual(sheet.getDisplay('B2'), '2');
  assert.strictEqual(sheet.getDisplay('B3'), 'big');
});

test('adjusts relative references when copying formulas', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '10');
  sheet.setCell('B1', '=A1+$A$1');
  sheet.copyCell('B1', 'B2');
  assert.strictEqual(sheet.getRaw('B2'), '=A2+$A$1');
});

test('detects circular references without crashing', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '=A2');
  sheet.setCell('A2', '=A1');
  assert.strictEqual(sheet.getDisplay('A1'), '#CIRC!');
  assert.strictEqual(sheet.getDisplay('A2'), '#CIRC!');
});

test('evaluates comparisons, string concatenation, and boolean functions', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '5');
  sheet.setCell('A2', 'text');
  sheet.setCell('B1', '=A1>=5');
  sheet.setCell('B2', '=A2<>"other"');
  sheet.setCell('B3', '="Total: "&A1&" "&B1');
  sheet.setCell('B4', '=AND(B1,B2,NOT(FALSE))');
  sheet.setCell('B5', '=OR(FALSE,A1<3,A2="text")');

  assert.strictEqual(sheet.getDisplay('B1'), 'TRUE');
  assert.strictEqual(sheet.getDisplay('B2'), 'TRUE');
  assert.strictEqual(sheet.getDisplay('B3'), 'Total: 5 TRUE');
  assert.strictEqual(sheet.getDisplay('B4'), 'TRUE');
  assert.strictEqual(sheet.getDisplay('B5'), 'TRUE');
});

test('returns clear errors for bad syntax, unknown functions, and divide by zero', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '=1+');
  sheet.setCell('A2', '=MISSING(1)');
  sheet.setCell('A3', '=10/0');

  assert.strictEqual(sheet.getDisplay('A1'), '#ERR!');
  assert.strictEqual(sheet.getDisplay('A2'), '#NAME?');
  assert.strictEqual(sheet.getDisplay('A3'), '#DIV/0!');
});

test('propagates errors through boolean functions', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '=AND(TRUE,1/0)');
  sheet.setCell('A2', '=OR(FALSE,UNKNOWN())');
  sheet.setCell('A3', '=NOT(1/0)');

  assert.strictEqual(sheet.getDisplay('A1'), '#DIV/0!');
  assert.strictEqual(sheet.getDisplay('A2'), '#NAME?');
  assert.strictEqual(sheet.getDisplay('A3'), '#DIV/0!');
});

test('returns ref errors for out-of-bounds references and ranges', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '=Z100');
  sheet.setCell('A2', '=AA1');
  sheet.setCell('A3', '=A101');
  sheet.setCell('A4', '=SUM(Y99:AA101)');

  assert.strictEqual(sheet.getDisplay('A1'), '');
  assert.strictEqual(sheet.getDisplay('A2'), '#REF!');
  assert.strictEqual(sheet.getDisplay('A3'), '#REF!');
  assert.strictEqual(sheet.getDisplay('A4'), '#REF!');
});
