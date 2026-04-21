const assert = require('assert');

const { createWorkbook, shiftFormula } = require('../src/formula-engine.js');

function expectCell(workbook, address, display, raw) {
  const cell = workbook.getCell(address);
  assert(cell, `expected cell ${address} to exist`);
  assert.strictEqual(cell.display, display, `${address} display`);
  if (raw !== undefined) {
    assert.strictEqual(cell.raw, raw, `${address} raw`);
  }
}

function runTests() {
  const workbook = createWorkbook();

  workbook.setCell('A1', '10');
  workbook.setCell('A2', '5');
  workbook.setCell('A3', '=A1+A2*2');
  expectCell(workbook, 'A3', '20', '=A1+A2*2');

  workbook.setCell('B1', '=SUM(A1:A3)');
  expectCell(workbook, 'B1', '35');

  workbook.setCell('B2', '=AVERAGE(A1:A2)');
  expectCell(workbook, 'B2', '7.5');

  workbook.setCell('B3', '=MIN(A1:A3)');
  expectCell(workbook, 'B3', '5');

  workbook.setCell('B4', '=MAX(A1:A3)');
  expectCell(workbook, 'B4', '20');

  workbook.setCell('B5', '=COUNT(A1:A3)');
  expectCell(workbook, 'B5', '3');

  workbook.setCell('C1', '=IF(A1>A2, "big", "small")');
  expectCell(workbook, 'C1', 'big');

  workbook.setCell('C2', '=AND(TRUE, A1>A2)');
  expectCell(workbook, 'C2', 'TRUE');

  workbook.setCell('C3', '=OR(FALSE, A1<A2)');
  expectCell(workbook, 'C3', 'FALSE');

  workbook.setCell('C4', '=NOT(FALSE)');
  expectCell(workbook, 'C4', 'TRUE');

  workbook.setCell('C5', '=ABS(-4.2)');
  expectCell(workbook, 'C5', '4.2');

  workbook.setCell('C6', '=ROUND(3.14159, 2)');
  expectCell(workbook, 'C6', '3.14');

  workbook.setCell('C7', '=CONCAT("A", "-", A1)');
  expectCell(workbook, 'C7', 'A-10');

  workbook.setCell('D1', '="Total: "&SUM(A1:A2)');
  expectCell(workbook, 'D1', 'Total: 15');

  workbook.setCell('D2', '=A1=A2');
  expectCell(workbook, 'D2', 'FALSE');

  workbook.setCell('D3', '=A1<>A2');
  expectCell(workbook, 'D3', 'TRUE');

  workbook.setCell('D4', '=Z99+1');
  expectCell(workbook, 'D4', '1');

  workbook.setCell('E1', '=UNKNOWN(1)');
  expectCell(workbook, 'E1', '#ERR!');

  workbook.setCell('E2', '=1/0');
  expectCell(workbook, 'E2', '#DIV/0!');

  workbook.setCell('E3', '=SUM(');
  expectCell(workbook, 'E3', '#ERR!');

  workbook.setCell('F1', '=F2');
  workbook.setCell('F2', '=F1');
  expectCell(workbook, 'F1', '#CIRC!');
  expectCell(workbook, 'F2', '#CIRC!');

  workbook.setCell('G1', '=A1+A2');
  expectCell(workbook, 'G1', '15');
  workbook.setCell('A2', '8');
  expectCell(workbook, 'G1', '18');

  workbook.setCell('H1', '=SUM(A1:B2)');
  expectCell(workbook, 'H1', '71');

  workbook.setCell('I1', '=IF(TRUE, 1, 1/0)');
  expectCell(workbook, 'I1', '1');

  workbook.setCell('I2', '=IF(FALSE, 1/0, 2)');
  expectCell(workbook, 'I2', '2');

  assert.strictEqual(shiftFormula('=A1+$B$2&C$3&$D4', 2, 1), '=B3+$B$2&D$3&$D6');
  assert.strictEqual(shiftFormula('=SUM(A1:B2)', 1, 2), '=SUM(C2:D3)');
}

runTests();
console.log('formula-engine tests passed');
