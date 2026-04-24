const assert = require('assert');
const core = require('./spreadsheet-core.js');

function makeSheet() {
  const sheet = core.createSheet(26, 100);
  return sheet;
}

function set(sheet, address, raw) {
  sheet.setCell(address, raw);
}

function value(sheet, address) {
  return sheet.getDisplayValue(address);
}

{
  const sheet = makeSheet();
  set(sheet, 'A1', '10');
  set(sheet, 'A2', '5');
  set(sheet, 'A3', '=A1+A2*2');
  assert.strictEqual(value(sheet, 'A3'), '20');
}

{
  const sheet = makeSheet();
  set(sheet, 'A1', '2');
  set(sheet, 'A2', '3');
  set(sheet, 'A3', '4');
  set(sheet, 'B1', '=SUM(A1:A3)');
  set(sheet, 'B2', '=IF(B1>=9,"ok","bad")');
  assert.strictEqual(value(sheet, 'B1'), '9');
  assert.strictEqual(value(sheet, 'B2'), 'ok');
}

{
  const shifted = core.shiftFormula('=A1+$A1+A$1+$A$1+SUM(A1:B2)', 0, 0, 1, 2);
  assert.strictEqual(shifted, '=C2+$A2+C$1+$A$1+SUM(C2:D3)');
}

{
  const sheet = makeSheet();
  set(sheet, 'A1', '=B1');
  set(sheet, 'B1', '=A1');
  assert.strictEqual(value(sheet, 'A1'), '#CIRC!');
  assert.strictEqual(value(sheet, 'B1'), '#CIRC!');
}

{
  const sheet = makeSheet();
  set(sheet, 'A1', '1');
  set(sheet, 'A2', '2');
  set(sheet, 'B1', '=A1+A2');
  sheet.insertRows(0, 1);
  assert.strictEqual(sheet.getRaw('A2'), '1');
  assert.strictEqual(sheet.getRaw('A3'), '2');
  assert.strictEqual(sheet.getRaw('B2'), '=A2+A3');
  assert.strictEqual(value(sheet, 'B2'), '3');
}

console.log('spreadsheet core tests passed');
