const assert = require('assert');
const engine = require('../spreadsheet-core.js');

function sheet() {
  const s = engine.createSheet(26, 100);
  return {
    set(cell, value) {
      engine.setCell(s, cell, value);
    },
    value(cell) {
      return engine.displayValue(s, cell);
    },
    raw(cell) {
      return engine.rawValue(s, cell);
    },
    paste(from, to) {
      engine.pasteCells(s, engine.rangeFromA1(from), engine.addressToCoord(to), false);
    },
  };
}

const s = sheet();
s.set('A1', '2');
s.set('A2', '3');
s.set('A3', '=SUM(A1:A2)*2');
assert.strictEqual(s.value('A3'), '10');

s.set('B1', '=A1+A2');
s.paste('B1:B1', 'C1');
assert.strictEqual(s.raw('C1'), '=B1+B2');

s.set('B2', '7');
assert.strictEqual(s.value('C1'), '12');

s.set('D1', '=D2');
s.set('D2', '=D1');
assert.strictEqual(s.value('D1'), '#CIRC!');

console.log('spreadsheet core tests passed');
