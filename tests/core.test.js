const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const context = { console, window: {}, localStorage: null };
vm.createContext(context);
vm.runInContext(source, context);

const { SpreadsheetCore } = context.window;

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

test('evaluates arithmetic, ranges, comparisons, IF, and concatenation', () => {
  const sheet = new SpreadsheetCore(100, 26);
  sheet.setCell(0, 0, '10');
  sheet.setCell(1, 0, '5');
  sheet.setCell(2, 0, '=SUM(A1:A2)*2');
  sheet.setCell(3, 0, '=IF(A3>=30,"Total: "&A3,"low")');

  assert.strictEqual(sheet.getDisplay(2, 0), '30');
  assert.strictEqual(sheet.getDisplay(3, 0), 'Total: 30');
});

test('pastes relative formulas with references shifted from source to target', () => {
  const sheet = new SpreadsheetCore(100, 26);
  sheet.setCell(0, 0, '2');
  sheet.setCell(0, 1, '3');
  sheet.setCell(1, 0, '=A1+B1');

  sheet.pasteBlock(2, 0, sheet.copyBlock(1, 0, 1, 1));
  assert.strictEqual(sheet.getRaw(2, 0), '=A2+B2');
});

test('inserted rows preserve formulas pointing at the same data', () => {
  const sheet = new SpreadsheetCore(100, 26);
  sheet.setCell(0, 0, '7');
  sheet.setCell(1, 0, '=A1*2');

  sheet.insertRow(0);
  assert.strictEqual(sheet.getRaw(2, 0), '=A2*2');
  assert.strictEqual(sheet.getDisplay(2, 0), '14');
});

test('circular references render as a clear error', () => {
  const sheet = new SpreadsheetCore(100, 26);
  sheet.setCell(0, 0, '=B1');
  sheet.setCell(0, 1, '=A1');

  assert.strictEqual(sheet.getDisplay(0, 0), '#CIRC!');
  assert.strictEqual(sheet.getDisplay(0, 1), '#CIRC!');
});
