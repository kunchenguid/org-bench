const assert = require('assert');

const {
  createEmptySheet,
  evaluateCell,
  parseCellRef,
  shiftFormula,
} = require('../spreadsheet-core');

function run() {
  const sheet = createEmptySheet();
  sheet.A1 = '10';
  sheet.A2 = '5';
  sheet.B1 = '=A1+A2*2';
  assert.strictEqual(evaluateCell(sheet, 'B1').display, '20');

  sheet.B2 = '=SUM(A1:A2)';
  assert.strictEqual(evaluateCell(sheet, 'B2').display, '15');

  sheet.B3 = '=AVERAGE(A1:A2)';
  assert.strictEqual(evaluateCell(sheet, 'B3').display, '7.5');

  sheet.C1 = '=A1>A2';
  assert.strictEqual(evaluateCell(sheet, 'C1').display, 'TRUE');

  sheet.C2 = '=A1&A2';
  assert.strictEqual(evaluateCell(sheet, 'C2').display, '105');

  sheet.D1 = '=D2';
  sheet.D2 = '=D1';
  assert.strictEqual(evaluateCell(sheet, 'D1').display, '#CIRC!');

  assert.deepStrictEqual(parseCellRef('$B12'), {
    col: 1,
    row: 11,
    colAbsolute: true,
    rowAbsolute: false,
  });

  assert.strictEqual(shiftFormula('=A1+$B$2+A$3+$C4', 1, 2), '=C2+$B$2+C$3+$C5');

  console.log('core tests passed');
}

run();
