const assert = require('assert');
const sheet = require('./formula-core.js');

function make() {
  const cells = new Map();
  return {
    set(addr, raw) { cells.set(addr, raw); },
    get(addr) { return cells.get(addr) || ''; },
    values() { return cells; }
  };
}

{
  const model = make();
  model.set('A1', '10');
  model.set('A2', '5');
  const host = { getRaw: model.get };
  assert.strictEqual(sheet.evaluateFormula('=A1+A2*2', 'C1', host).display, '20');
  assert.strictEqual(sheet.evaluateFormula('=SUM(A1:A2)', 'C2', host).display, '15');
  assert.strictEqual(sheet.evaluateFormula('="Total: "&SUM(A1:A2)', 'C3', host).display, 'Total: 15');
}

{
  const model = make();
  model.set('A1', '=B1');
  model.set('B1', '=A1');
  assert.strictEqual(sheet.evaluateFormula('=A1', 'C1', { getRaw: model.get }).display, '#CIRC!');
}

{
  assert.strictEqual(sheet.shiftFormula('=A1+$B$2+C$3+$D4', 2, 1), '=B3+$B$2+D$3+$D6');
  assert.strictEqual(sheet.shiftFormula('=SUM(A1:B2)', 1, 1), '=SUM(B2:C3)');
}

{
  assert.strictEqual(sheet.adjustFormulaForInsertDelete('=SUM(A1:A3)+B4', { type: 'row', index: 2, delta: 1 }), '=SUM(A1:A4)+B5');
  assert.strictEqual(sheet.adjustFormulaForInsertDelete('=A1+C1', { type: 'col', index: 2, delta: 1 }), '=A1+D1');
}

console.log('tests passed');
