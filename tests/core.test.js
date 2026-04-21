const assert = require('node:assert/strict');

const {
  createSheet,
  evaluateCell,
  shiftFormula,
} = require('../core.js');

function buildSheet(cells) {
  return createSheet(cells);
}

function expectDisplay(cells, address, expected) {
  const sheet = buildSheet(cells);
  assert.equal(evaluateCell(sheet, address).display, expected);
}

expectDisplay({ A1: '2', A2: '3', A3: '=A1+A2' }, 'A3', '5');
expectDisplay({ A1: '2', A2: '3', A3: '=SUM(A1:A2)' }, 'A3', '5');
expectDisplay({ A1: '2', B1: '=IF(A1>1, "ok", "no")' }, 'B1', 'ok');
expectDisplay({ A1: '2', B1: '=CONCAT("A", A1)' }, 'B1', 'A2');
expectDisplay({ A1: '=B1', B1: '=A1' }, 'A1', '#CIRC!');
assert.equal(shiftFormula('=A1+$B$2', 1, 2), '=C2+$B$2');

console.log('core tests passed');
