const assert = require('assert');
const core = require('../spreadsheet-core.js');

function makeSheet(cells) {
  return {
    rows: 100,
    cols: 26,
    cells: Object.assign({}, cells),
  };
}

function value(sheet, addr) {
  return core.evaluateCell(sheet, core.parseCellAddress(addr)).display;
}

assert.strictEqual(value(makeSheet({ A1: '2', A2: '3', A3: '=A1+A2*4' }), 'A3'), '14');
assert.strictEqual(value(makeSheet({ A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)' }), 'B1'), '6');
assert.strictEqual(value(makeSheet({ A1: '7', B1: '=IF(A1>5,"big","small")' }), 'B1'), 'big');
assert.strictEqual(value(makeSheet({ A1: '=TRUE<>FALSE', A2: '="Total: "&ROUND(2.345,2)' }), 'A1'), 'TRUE');
assert.strictEqual(value(makeSheet({ A1: '=TRUE<>FALSE', A2: '="Total: "&ROUND(2.345,2)' }), 'A2'), 'Total: 2.35');
assert.strictEqual(value(makeSheet({ A1: '=B1', B1: '=A1' }), 'A1'), '#CIRC!');
assert.strictEqual(value(makeSheet({ B1: '=SUM(A1:A101)' }), 'B1'), '#REF!');
assert.strictEqual(core.adjustFormula('=A1+$B$2+C$3+$D4+A1:B2', 0, 0, 2, 1), '=B3+$B$2+D$3+$D6+B3:C4');
assert.strictEqual(core.adjustFormulaForStructure('="A1 stays text: "&A1', 'row', 0, 1), '="A1 stays text: "&A2');
assert.strictEqual(core.adjustFormula('="A1 stays text: "&A1', 0, 0, 0, 1), '="A1 stays text: "&B1');

console.log('core tests passed');
