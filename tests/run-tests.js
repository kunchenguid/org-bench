const assert = require('assert');
const sheet = require('../formula-core.js');

function cellMap(values) {
  return {
    getRaw(address) {
      return Object.prototype.hasOwnProperty.call(values, address) ? values[address] : '';
    }
  };
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

test('evaluates arithmetic, ranges, comparisons, booleans, and strings', () => {
  const cells = cellMap({ A1: '2', A2: '3', A3: '=SUM(A1:A2)', B1: 'TRUE', B2: 'hello' });
  assert.strictEqual(sheet.evaluateCell('A3', cells).display, '5');
  assert.strictEqual(sheet.evaluateFormula('=IF(A3>=5,"Total: "&A3,"low")', 'C1', cells).display, 'Total: 5');
  assert.strictEqual(sheet.evaluateFormula('=AND(B1,A1<A2,NOT(FALSE))', 'C2', cells).display, 'TRUE');
});

test('detects circular references and divide by zero', () => {
  const circular = cellMap({ A1: '=B1', B1: '=A1' });
  assert.strictEqual(sheet.evaluateCell('A1', circular).display, '#CIRC!');
  assert.strictEqual(sheet.evaluateFormula('=1/0', 'C1', cellMap({})).display, '#DIV/0!');
});

test('rewrites relative references on paste and row insertion', () => {
  assert.strictEqual(sheet.shiftFormula('=SUM(A1:$B2,A$3,$C4)', 2, 1), '=SUM(B3:$B4,B$3,$C6)');
  assert.strictEqual(sheet.adjustFormulaForInsertDelete('=SUM(A1:A3)+B2', { type: 'row', index: 2, delta: 1 }), '=SUM(A1:A4)+B3');
  assert.strictEqual(sheet.adjustFormulaForInsertDelete('=A1+B2', { type: 'row', index: 2, delta: -1 }), '=A1+#REF!');
});

process.on('exit', () => {
  if (process.exitCode) process.exit(process.exitCode);
});
